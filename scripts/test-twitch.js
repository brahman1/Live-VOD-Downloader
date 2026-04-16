const https = require('https');

const token = "f4ixz0c7gj9dnche31elkn2lhr5vmk";
const data = JSON.stringify({
  query: `query {
    currentUser {
      id
      followings {
        edges {
          node {
            login
          }
        }
      }
    }
  }`
});

const options = {
  hostname: 'gql.twitch.tv',
  port: 443,
  path: '/gql',
  method: 'POST',
  headers: {
    'Client-ID': 'kimne78kx3ncx6brago4mv6wki5h1fc',
    'Authorization': `OAuth ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let chunks = '';
  res.on('data', d => chunks += d);
  res.on('end', () => console.log(chunks));
});
req.on('error', e => console.error(e));
req.write(data);
req.end();
