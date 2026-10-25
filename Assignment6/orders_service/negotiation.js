const JSON_FMT = "json";
const XML_FMT = "xml";

const CONTENT_TYPE = {
  [JSON_FMT]: "application/json; charset=utf-8",
  [XML_FMT]: "application/xml; charset=utf-8",
};

const PROBLEM_CONTENT_TYPE = {
  [JSON_FMT]: "application/problem+json; charset=utf-8",
  [XML_FMT]: "application/problem+xml; charset=utf-8",
};

const PROBLEM_XML_NS = "urn:ietf:params:xml:ns:problem";

function parseAccept(header) {
  if (!header || !header.trim()) {
    return [{ mime: "*/*", q: 1.0 }];
  }
  const parts = header.split(",").map((p) => p.trim()).filter(Boolean);
  const result = [];
  for (const part of parts) {
    const sub = part.split(";").map((s) => s.trim());
    const mime = sub[0].toLowerCase();
    let q = 1.0;
    for (let i = 1; i < sub.length; i++) {
      if (sub[i].startsWith("q=")) {
        const val = parseFloat(sub[i].slice(2));
        if (!isNaN(val)) q = val;
      }
    }
    result.push({ mime, q });
  }
  return result;
}

function chooseFormat(acceptHeader) {
  if (!acceptHeader || !acceptHeader.trim()) {
    return JSON_FMT;
  }
  const entries = parseAccept(acceptHeader);
  let bestFmt = null;
  let bestQ = -1;

  for (const { mime, q } of entries) {
    if (mime === "application/xml" && q > bestQ) {
      bestFmt = XML_FMT;
      bestQ = q;
    } else if (mime === "application/json" && q > bestQ) {
      bestFmt = JSON_FMT;
      bestQ = q;
    } else if (mime === "*/*" && q > bestQ) {
      bestFmt = JSON_FMT;
      bestQ = q;
    }
  }

  return bestFmt;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fillXml(value, path, parentTag, childTags) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    const tag = childTags[path] || childTags[parentTag] || "item";
    let xml = "";
    for (const item of value) {
      xml += `<${tag}>${fillXml(item, `${path}/${tag}`, tag, childTags)}</${tag}>`;
    }
    return xml;
  }
  if (typeof value === "object") {
    let xml = "";
    for (const [k, v] of Object.entries(value)) {
      xml += `<${k}>${fillXml(v, `${path}/${k}`, k, childTags)}</${k}>`;
    }
    return xml;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return escapeXml(value);
}

function toXml(rootTag, data, childTags = {}, namespace = null) {
  const nsAttr = namespace ? ` xmlns="${namespace}"` : "";
  const inner = fillXml(data, rootTag, rootTag, childTags);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}${nsAttr}>${inner}</${rootTag}>`;
}

function respond(req, res, data, status = 200, { root, childTags = {}, headers = {}, problem = false } = {}) {
  const fmt = res.locals.fmt || chooseFormat(req.headers.accept) || JSON_FMT;
  const ctype = (problem ? PROBLEM_CONTENT_TYPE : CONTENT_TYPE)[fmt];

  res.status(status);
  res.setHeader("Content-Type", ctype);
  res.setHeader("Vary", "Accept");

  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
  }

  if (fmt === XML_FMT) {
    const body = toXml(root, data, childTags, problem ? PROBLEM_XML_NS : null);
    return res.end(body);
  }

  const jsonBody = JSON.stringify(data) + "\n";
  return res.end(jsonBody);
}

module.exports = {
  JSON_FMT,
  XML_FMT,
  chooseFormat,
  toXml,
  respond,
};
