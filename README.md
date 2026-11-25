# Market Scanner

A portable Windows desktop application for the Volume Scanner (including its Sector Heatmap), Sector Performance and Market Monitor. Electron bundles Chromium and Node. The main process reads daily charts from Yahoo Finance, source listings from Nasdaq Trader, sector metadata from Nasdaq and S&P 500 constituents from datasets/s-and-p-500-companies. All market processing and SQLite storage run on the device.

See START-HERE.txt for scanner criteria, market coverage, loading, and cache behavior. The distributed ZIP includes the Electron and Chromium license notices. It contains no preloaded quote database.

## Development

Use Node.js 24 or later with npm. Run `npm ci` and `npm start`. Run `npm test` for the scanner, breadth, period calculations, session cutoff and cache tests.

## Build the Windows ZIP

Install Node.js 24+ and Python 3.11+ on the build machine. From the source directory, run `npm ci --ignore-scripts` followed by `python scripts/build_windows.py`. The script downloads the official Windows x64 Electron archive, verifies its pinned SHA-256 digest, adds the SPaDe icon, version information and desktop files, and writes the portable ZIP under dist. An existing official runtime ZIP can be supplied with `--runtime PATH`.

Only the build machine uses these tools. Users extract the Windows ZIP and open Market Scanner.exe.

## Market data rights

The ZIP contains the application and its runtime. Each user's computer contacts the providers directly. Yahoo's Finance help page says redistribution of its information is prohibited. Review the intended use and secure appropriate provider rights before a public or commercial rollout. See https://help.yahoo.com/kb/SLN2310.html.
