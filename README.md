# Beyond the Sticker Price

A responsive vehicle cost calculator built with plain HTML, CSS, and JavaScript. Estimate a monthly loan payment and the ownership expenses beyond that payment. All displayed amounts use Canadian dollars (CAD).

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

The monthly estimate adds insurance, fuel, maintenance, repair reserves, tire reserves, parking, optional tickets/fines, and other costs to the loan payment. Occasional expenses should be entered as monthly averages.

## Assumptions

- Sales tax applies to the entire vehicle price before down payment and trade-in. This is a simplified estimate and does not model different transaction or trade-in tax treatments.
- The estimate measures monthly cash outflow, rather than total economic ownership cost.
- Depreciation and upfront payments are excluded. Registration and dealer fees are excluded unless the user accounts for them in their inputs.
- Repair and tire reserves are budgeting amounts; actual spending varies.
- Calculations run in the browser. There is no database or automatic saving of entered values.

## Quick check

The default example uses a $30,000 price, $5,000 down payment, 5% tax, 7% annual interest, and a 60-month loan. It produces approximately $524.73 in monthly loan payments and $1,109.73 in estimated total monthly costs.
