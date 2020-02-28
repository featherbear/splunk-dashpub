const fetch = require('node-fetch');
const { XmlDocument } = require('xmldoc');

const noValidateHttpsAgent = new (require('https').Agent)({
    rejectUnauthorized: false,
});

const qs = obj =>
    Object.entries(obj)
        .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
        .join('&');

const splunkd = (
    method,
    path,
    { body, url = process.env.SPLUNKD_URL, username = process.env.SPLUNKD_USER, password = process.env.SPLUNKD_PASSWORD } = {}
) => {
    return fetch(`${url}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        },
        body,
        agent: url.startsWith('https:') ? noValidateHttpsAgent : undefined,
    }).then(res => {
        if (res.status > 299) {
            throw new Error(`Splunkd responded with HTTP status ${res.status}`);
        }
        return res.json();
    });
};

const extractDashboardDefinition = xmlSrc => JSON.parse(new XmlDocument(xmlSrc).childNamed('definition').val);

const loadDashboard = (
    name,
    app,
    { url = process.env.SPLUNKD_URL, username = process.env.SPLUNKD_USER, password = process.env.SPLUNKD_PASSWORD } = {}
) =>
    splunkd('GET', `/servicesNS/-/${encodeURIComponent(app)}/data/ui/views/${encodeURIComponent(name)}?output_mode=json`, {
        url,
        username,
        password,
    }).then(data => extractDashboardDefinition(data.entry[0].content['eai:data']));

const listDashboards = async (
    app,
    { url = process.env.SPLUNKD_URL, username = process.env.SPLUNKD_USER, password = process.env.SPLUNKD_PASSWORD } = {}
) => {
    const res = await splunkd(
        'GET',
        `/servicesNS/-/${encodeURIComponent(app)}/data/ui/views?${qs({
            output_mode: 'json',
            count: 0,
            offset: 0,
            search: `(isDashboard=1 AND isVisible=1 AND (version=2 OR version=1))`,
        })}`,
        {
            url,
            username,
            password,
        }
    );

    return res.entry
        .filter(entry => entry.acl.app === app)
        .map(entry => ({
            name: entry.name,
            label: entry.content.label,
        }));
};

async function validateAuth({ url, user, password }) {
    try {
        await splunkd('GET', '/services/server/info', { url, username: user, password });
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    splunkd,
    loadDashboard,
    listDashboards,
    validateAuth,
    qs,
};