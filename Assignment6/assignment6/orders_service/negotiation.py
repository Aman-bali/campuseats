"""Content negotiation + the ONE place a response body is written (C3, C4).

Every response in the service - success or error - is built by `respond()`.
That guarantees (a) the representation follows the Accept header and (b)
every body carries an explicit Content-Type with charset=utf-8.
"""
from xml.etree import ElementTree as ET

from flask import Response, current_app, g
from werkzeug.datastructures import MIMEAccept
from werkzeug.http import parse_accept_header

JSON, XML = "json", "xml"
OFFERS = ["application/json", "application/xml"]           # first = default
_FORMAT_OF = {"application/json": JSON, "application/xml": XML}

CONTENT_TYPE = {
    JSON: "application/json; charset=utf-8",
    XML: "application/xml; charset=utf-8",
}
PROBLEM_CONTENT_TYPE = {
    JSON: "application/problem+json; charset=utf-8",
    XML: "application/problem+xml; charset=utf-8",
}
PROBLEM_XML_NS = "urn:ietf:params:xml:ns:problem"          # RFC 9457 section 6.1


def choose_format(accept_header):
    """Pick the representation for an Accept header.

    No header or */*       -> JSON (the default)
    application/xml        -> XML
    q-values are honoured (xml;q=0.9, json;q=0.5 -> XML)
    nothing we can make    -> None  (caller answers 406)
    """
    if accept_header is None or not accept_header.strip():
        return JSON
    best = parse_accept_header(accept_header, MIMEAccept).best_match(OFFERS)
    return _FORMAT_OF.get(best)


# ----------------------------------------------------------------- XML ----
def _fill(el, value, path, child_tags):
    if isinstance(value, dict):
        for key, val in value.items():
            _fill(ET.SubElement(el, key), val, f"{path}/{key}", child_tags)
    elif isinstance(value, list):
        # tag for each list member: by full path first, then by parent tag
        tag = child_tags.get(path) or child_tags.get(el.tag, "item")
        for val in value:
            _fill(ET.SubElement(el, tag), val, f"{path}/{tag}", child_tags)
    elif isinstance(value, bool):
        el.text = "true" if value else "false"
    elif value is not None:
        el.text = str(value)


def to_xml(root_tag, data, child_tags=None, namespace=None):
    """Tiny dict -> XML serialiser (ElementTree escapes all text for us)."""
    root = ET.Element(root_tag)
    if namespace:
        root.set("xmlns", namespace)
    _fill(root, data, root_tag, child_tags or {})
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")


# ------------------------------------------------------------ responses ----
def respond(data, status=200, *, root, child_tags=None, headers=None, problem=False):
    """Serialise `data` in the negotiated format and label it correctly."""
    fmt = getattr(g, "fmt", JSON)
    if fmt == XML:
        body = to_xml(root, data, child_tags,
                      PROBLEM_XML_NS if problem else None)
    else:
        body = current_app.json.dumps(data) + "\n"
    ctype = (PROBLEM_CONTENT_TYPE if problem else CONTENT_TYPE)[fmt]
    resp = Response(body, status=status, content_type=ctype)
    for name, value in (headers or {}).items():
        resp.headers[name] = value
    return resp
