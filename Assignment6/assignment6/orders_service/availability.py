"""Is each ordered item still on the menu? (-> 422 item-unavailable)

Stand-in for the Catalogue service (Assignment 5: `isAvailable` on a menu
item). The Orders service owns no menu data, so it asks this object. The
demo version reads sold-out ids from the UNAVAILABLE_ITEMS env var
(comma separated); production would call Catalogue over HTTP instead, with the
same timeout/retry rules as the Payments client.
"""
import os


class StaticAvailability:
    def __init__(self, unavailable=None):
        if unavailable is None:
            raw = os.environ.get("UNAVAILABLE_ITEMS", "")
            unavailable = {x.strip() for x in raw.split(",") if x.strip()}
        self.unavailable = set(unavailable)

    def unavailable_among(self, item_ids):
        return [i for i in item_ids if i in self.unavailable]
