# Bounty: The Perfect March Dinner Party

Design a 3-course dinner party menu for a March gathering in London.

## Create in UI

- **Title:** The Perfect March Dinner Party
- **Description:** (paste below)
- **Category:** Miscellaneous
- **Eval Type:** Script Eval (deterministic)
- **Eval Script:** Paste contents of `eval.py`
- **Allowed file types:** json
- **Challenge type:** creative
- **Reward:** 50 USDC
- **Deadline:** 48 hours from now
- **Winners:** 3
- **Payout:** 60/30/10
- **Score direction:** higher_is_better

## Description to paste

```
Design a 3-course dinner party menu for 6-8 guests in London, March 2026.

Submit a single JSON file with the following structure:

{
  "starter": {
    "name": "string",
    "description": "string",
    "ingredients": ["string"],
    "prep_time_minutes": number,
    "cook_time_minutes": number
  },
  "main": {
    "name": "string",
    "description": "string",
    "ingredients": ["string"],
    "prep_time_minutes": number,
    "cook_time_minutes": number
  },
  "dessert": {
    "name": "string",
    "description": "string",
    "ingredients": ["string"],
    "prep_time_minutes": number,
    "cook_time_minutes": number
  },
  "wine_pairing": {
    "starter_wine": "string",
    "main_wine": "string",
    "dessert_wine": "string"
  },
  "hosting_notes": "string"
}

Constraints:
- Use seasonal March London ingredients
- NO NUTS (allergy at the table) — almonds, walnuts, pecans, cashews, pistachios, hazelnuts, macadamia, peanuts, praline
- Impressive but not pretentious (no foams, gels, 15-ingredient plates)
- Total active cooking time under 3 hours (sum of all prep + cook times)
- At least one course must be make-ahead (mention in hosting_notes)
- Feeds 6-8 without specialty equipment
- Wine pairings must be specific — include grape variety and region, not just "a white wine"

Scoring (100 total):
- Structure (10) — all fields present and valid
- Seasonality (20) — March London ingredients, penalty for out-of-season
- Creativity & balance (20) — cooking method variety, ingredient diversity, nut-free compliance
- Feasibility (20) — realistic times, total <3h active, make-ahead noted
- Wine pairing (15) — specific grapes/regions, tasting notes
- Hosting notes (15) — timing plan, plating advice, practical tips
```
