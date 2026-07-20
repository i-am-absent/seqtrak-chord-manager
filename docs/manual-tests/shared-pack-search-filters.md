# Shared Pack Search and Filters Manual Verification

1. Open Shared Packs and confirm the newest unfiltered page loads.
2. Type a pack-name fragment; confirm no request/result change before 300 ms and matching cards appear afterward.
3. Repeat with an author fragment and a tag fragment in the combined search.
4. Enter Japanese text through IME and confirm no partial composition result is requested.
5. Set Author and one Pack Key; confirm both conditions apply.
6. Add two tags with Enter/Add and confirm only packs containing both remain.
7. Remove one tag chip, refresh, and load another page; confirm the remaining filters persist.
8. Search for literal `%`, `_`, and `\`; confirm they do not behave as wildcards.
9. Clear filters and confirm the unfiltered newest page returns.
10. At 640px and 375px widths, confirm controls stack, chips wrap, and every action remains keyboard operable.
11. While filtered, load a pack into the Editor and delete an owned pack; confirm existing behavior remains intact.
