"""
NOT part of the Catalogue Service submission.

This is a two-line stand-in for Tutorial 4's real Payments service,
used only so the curl transcript in this repo can be captured against
a live dependency. Run it separately on port 5001 before demoing the
happy path; kill it to demonstrate the D3 fallback.
"""
from flask import Flask

app = Flask(__name__)


@app.get("/health")
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    app.run(port=5001)
