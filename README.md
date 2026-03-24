# tm-userscripts

Personal Tampermonkey userscripts.

## Scripts

### Desticky

`desticky.user.js` disables CSS sticky positioning on demand. To avoid
breaking sites, its functionality is off by default; it can be enabled
per-host via tampermonkey menu command.

### Tblsort

`tblsort.user.js` makes HTML tables sortable by clicking column
headers. It handles text, numbers, and dates, and can restore the
original row order when sorting is cleared.

## Testing

There’s no real tests, but `make lint` will run various lint checks.
