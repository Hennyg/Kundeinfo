const { getAccessToken } = require("./auth");

async function graph(method, path, body) {
  const token = await getAccessToken();
  const url = /^https?:\/\//i.test(path)
    ? path
    : `https://graph.microsoft.com/v1.0${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(`Microsoft Graph fejl ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

module.exports = { graph };
