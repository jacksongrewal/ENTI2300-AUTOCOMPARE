# Beyond the Sticker Price

An interactive, responsive vehicle cost comparison prototype built with plain HTML, CSS, and JavaScript. Compare up to three vehicles by their monthly loan payment and the ownership expenses beyond that payment. All displayed amounts use Canadian dollars (CAD).

## Features

- **Compare up to 3 vehicles** using tabs. A new vehicle starts as a copy of the one you are viewing.
- **Live results.** Everything updates as you type, and invalid fields are highlighted with a short explanation.
- **Example vehicles** (compact sedan, SUV, pickup, EV, used commuter) to start from. The values are illustrative, not quotes.
- **Fuel estimator** that turns distance, fuel use and fuel price into a monthly fuel cost.
- **Monthly cost breakdown chart** with hover or tap details for each cost category.
- **Cumulative cash-out chart** with an adjustable ownership period (1 to 10 years). It shows how the line flattens once a loan is paid off.
- **Full comparison table** that flags the lowest monthly cost, interest and cash out.
- **Shareable links.** The current comparison is saved in the page URL, so "Copy share link" lets someone else open exactly what you see. Nothing is sent to a server.

## Files

- `index.html`: page layout
- `styles.css`: responsive styling
- `script.js`: inputs, loan calculation, validation, and results
- `.gitignore`: excludes local files and hosting configuration
- `.nojekyll`: serves the project as a plain static GitHub Pages site

## Run locally

Download the repository and open `index.html` in a modern browser. No installation, build step, API keys, or backend is required. Keep the HTML, CSS, and JavaScript files together.

## Publish

Upload all files from this folder to the root of your GitHub repository. To host it, configure GitHub Pages to deploy from your main branch and the root folder. See the current GitHub Pages documentation if the settings differ for your account.

## How it works

Amount financed = max(0, vehicle price + estimated sales tax - down payment - trade-in).

The calculator uses a standard fixed-rate monthly amortization formula. At zero interest, the loan payment equals the amount financed divided by the loan term. A fully paid vehicle has no loan payment. Inputs must be nonnegative, and the loan term must be a positive whole number of months.

Cash out over a period = down payment + loan payments made within the period + monthly running costs for every month of the period. Trade-in value is not counted as cash.

The monthly estimate adds insurance, fuel, maintenance, repair reserves, tire reserves, parking, optional tickets/fines, and other costs to the loan payment. Occasional expenses should be entered as monthly averages.

## Assumptions

- Sales tax applies to the entire vehicle price before down payment and trade-in. This is a simplified estimate and does not model different transaction or trade-in tax treatments.
- The estimate measures monthly cash outflow, rather than total economic ownership cost.
- Depreciation and upfront payments are excluded. Registration and dealer fees are excluded unless the user accounts for them in their inputs.
- Repair and tire reserves are budgeting amounts; actual spending varies.
- Calculations run in the browser. There is no database; entered values are kept only in the page URL (for share links).

## Quick check

The default "New car example" uses a $30,000 price, $5,000 down payment, 5% tax, 7% annual interest, and a 60-month loan. It produces approximately $524.73 in monthly loan payments and $1,109.73 in estimated total monthly costs.
