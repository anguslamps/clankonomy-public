"""
Eval script for The Perfect March Dinner Party bounty.
Reads a JSON submission, scores it deterministically on structure,
seasonality, creativity, feasibility, wine pairing, and hosting notes.
Outputs SCORE: 0-100.

Scoring breakdown:
  Structure:    10 pts
  Seasonality:  25 pts
  Creativity:   25 pts
  Feasibility:  20 pts
  Wine pairing: 15 pts
  Hosting notes: 5 pts
Total: 100 pts
"""
import os
import sys
import json
import re

submission_file = os.environ.get("SUBMISSION_FILE", "/eval/submission.json")

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

MARCH_SEASONAL = {
    # vegetables
    "purple sprouting broccoli", "broccoli", "leeks", "leek", "celeriac",
    "parsnips", "parsnip", "jerusalem artichokes", "jerusalem artichoke",
    "cauliflower", "cabbage", "savoy cabbage", "kale", "cavolo nero",
    "beetroot", "beet", "carrots", "carrot", "swede", "turnips", "turnip",
    "chard", "spinach", "watercress", "chicory", "endive", "radicchio",
    "wild garlic", "spring onions", "spring onion", "radishes", "radish",
    "celery", "fennel", "potatoes", "potato", "onions", "onion",
    "garlic", "shallots", "shallot", "mushrooms", "mushroom",
    # herbs
    "rosemary", "thyme", "sage", "bay leaf", "bay leaves", "parsley",
    "chives",
    # fruit
    "rhubarb", "forced rhubarb", "blood oranges", "blood orange",
    "oranges", "orange", "lemons", "lemon", "limes", "lime",
    "apples", "apple", "pears", "pear", "grapefruit",
}

# Hero seasonal ingredients — peak March, show deep UK seasonality knowledge
HERO_SEASONAL = {
    "forced rhubarb", "purple sprouting broccoli", "blood orange",
    "blood oranges", "wild garlic", "celeriac", "jerusalem artichoke",
    "jerusalem artichokes",
}

OUT_OF_SEASON = {
    "tomatoes", "tomato", "cherry tomatoes", "sun-dried tomatoes",
    "strawberries", "strawberry", "raspberries", "raspberry",
    "blueberries", "blueberry", "blackberries", "blackberry",
    "peaches", "peach", "nectarines", "nectarine",
    "apricots", "apricot", "plums", "plum", "cherries", "cherry",
    "figs", "fig", "melon", "watermelon", "mango", "papaya",
    "pineapple", "zucchini", "courgette", "aubergine", "eggplant",
    "bell peppers", "bell pepper", "red pepper", "green pepper",
    "yellow pepper", "corn", "sweetcorn", "runner beans", "runner bean",
    "broad beans", "broad bean", "peas", "fresh peas",
    "asparagus", "basil", "fresh basil",
}

NEUTRAL_INGREDIENTS = {
    "chicken", "beef", "lamb", "pork", "duck", "venison", "rabbit",
    "salmon", "cod", "sea bass", "trout", "mackerel", "haddock",
    "prawns", "shrimp", "mussels", "clams", "scallops", "crab",
    "lobster", "anchovies", "anchovy", "bacon", "pancetta",
    "chorizo", "prosciutto", "ham", "sausage", "egg", "eggs",
    "butter", "cream", "double cream", "creme fraiche", "mascarpone",
    "ricotta", "parmesan", "parmigiano", "gruyere", "cheddar",
    "goats cheese", "goat cheese", "mozzarella", "burrata",
    "stilton", "blue cheese", "feta", "brie", "camembert",
    "flour", "plain flour", "self-raising flour", "bread",
    "breadcrumbs", "panko", "pasta", "rice", "risotto rice",
    "arborio rice", "couscous", "polenta", "quinoa", "lentils",
    "chickpeas", "cannellini beans", "butter beans",
    "olive oil", "vegetable oil", "sunflower oil", "rapeseed oil",
    "sesame oil", "vinegar", "red wine vinegar", "white wine vinegar",
    "balsamic vinegar", "sherry vinegar", "cider vinegar",
    "salt", "pepper", "black pepper", "white pepper", "sugar",
    "caster sugar", "icing sugar", "brown sugar", "demerara sugar",
    "honey", "maple syrup", "golden syrup", "treacle",
    "vanilla", "vanilla extract", "vanilla pod", "vanilla bean",
    "cinnamon", "nutmeg", "cumin", "coriander", "turmeric",
    "paprika", "smoked paprika", "cayenne", "chilli", "chili",
    "ginger", "fresh ginger", "star anise", "cardamom", "cloves",
    "saffron", "mustard", "dijon mustard", "wholegrain mustard",
    "soy sauce", "worcestershire sauce", "fish sauce",
    "stock", "chicken stock", "beef stock", "vegetable stock",
    "wine", "red wine", "white wine", "sherry", "port", "marsala",
    "brandy", "cognac", "rum", "amaretto", "grand marnier",
    "cocoa", "cocoa powder", "chocolate", "dark chocolate",
    "milk chocolate", "white chocolate",
    "gelatin", "gelatine", "agar", "cornflour", "cornstarch",
    "baking powder", "baking soda", "bicarbonate of soda",
    "yeast", "dried yeast",
    "cream cheese", "yoghurt", "yogurt", "milk", "whole milk",
    "capers", "olives", "sundried tomato paste", "tomato paste",
    "tomato puree", "passata", "tinned tomatoes", "canned tomatoes",
    "coconut milk", "coconut cream",
    "lamb shoulder", "lamb leg", "lamb shank", "lamb rack",
    "chicken thighs", "chicken breast", "chicken legs",
    "pork belly", "pork loin", "pork shoulder",
    "beef cheek", "beef shin", "beef short rib", "beef fillet",
    "duck breast", "duck leg", "duck confit",
}

NUT_KEYWORDS = [
    "nut", "nuts", "almond", "almonds", "walnut", "walnuts",
    "pecan", "pecans", "cashew", "cashews", "pistachio", "pistachios",
    "hazelnut", "hazelnuts", "macadamia", "peanut", "peanuts",
    "praline", "frangipane", "marzipan",
]

NUT_FALSE_POSITIVES = ["butternut", "coconut", "doughnut", "chestnut", "nutmeg"]

GRAPE_VARIETIES = [
    "chardonnay", "sauvignon blanc", "riesling", "pinot grigio",
    "pinot gris", "gewurztraminer", "viognier", "marsanne",
    "roussanne", "vermentino", "albarino", "gruner veltliner",
    "chenin blanc", "semillon", "muscadet", "melon de bourgogne",
    "torrontes", "fiano", "garganega", "verdicchio", "trebbiano",
    "assyrtiko", "godello", "txakoli", "picpoul",
    "pinot noir", "cabernet sauvignon", "merlot", "syrah", "shiraz",
    "grenache", "garnacha", "tempranillo", "sangiovese",
    "nebbiolo", "barbera", "dolcetto", "montepulciano",
    "malbec", "carmenere", "cabernet franc", "gamay", "mourvedre",
    "zinfandel", "primitivo", "pinotage", "touriga nacional",
    "nero d'avola", "aglianico",
    "moscato", "muscat", "moscatel", "prosecco", "champagne",
    "cava", "cremant", "sauternes", "tokaji",
]

WINE_REGIONS = [
    "bordeaux", "burgundy", "bourgogne", "champagne", "loire",
    "alsace", "rhone", "languedoc", "provence", "beaujolais",
    "chablis", "sancerre", "vouvray", "muscadet", "medoc",
    "saint-emilion", "pomerol", "graves", "pessac-leognan",
    "cotes du rhone", "chateauneuf-du-pape", "hermitage",
    "crozes-hermitage", "condrieu", "gigondas", "vacqueyras",
    "tuscany", "toscana", "piedmont", "piemonte", "veneto",
    "sicily", "sicilia", "sardinia", "sardegna", "friuli",
    "alto adige", "trentino", "umbria", "abruzzo", "puglia",
    "chianti", "brunello", "barolo", "barbaresco", "amarone",
    "soave", "valpolicella",
    "rioja", "ribera del duero", "priorat", "rias baixas",
    "rueda", "jerez", "penedes", "navarra",
    "napa", "sonoma", "willamette", "oregon", "washington",
    "central coast", "paso robles", "santa barbara",
    "marlborough", "hawkes bay", "central otago",
    "barossa", "mclaren vale", "hunter valley", "yarra valley",
    "margaret river", "adelaide hills", "clare valley", "eden valley",
    "stellenbosch", "swartland", "franschhoek",
    "mendoza", "uco valley", "salta",
    "douro", "dao", "alentejo", "vinho verde", "minho",
    "mosel", "rheingau", "pfalz", "rheinhessen", "franken",
    "wachau", "kamptal", "kremstal",
    "santorini", "naoussa",
    "d'asti", "asti",
]

WINE_FLAVOR_DESCRIPTORS = [
    "fruit", "citrus", "berry", "cherry", "plum", "apple", "pear",
    "peach", "apricot", "tropical", "mineral", "minerality", "saline",
    "acid", "acidity", "tannin", "tannins", "oak", "oaky", "vanilla",
    "spice", "pepper", "herbal", "floral", "earthy", "smoky",
    "honey", "toast", "butter", "cream", "crisp", "dry", "sweet",
    "finish", "nose", "palate", "bouquet", "aroma",
]

COOKING_METHODS = {
    "roast": ["roast", "roasted", "roasting"],
    "braise": ["braise", "braised", "braising"],
    "grill": ["grill", "grilled", "grilling"],
    "pan-fry": ["pan-fry", "pan-fried", "pan fry", "pan fried"],
    "sear": ["sear", "seared", "searing"],
    "bake": ["bake", "baked", "baking"],
    "poach": ["poach", "poached", "poaching"],
    "steam": ["steam", "steamed", "steaming"],
    "saute": ["sautee", "saute", "sauteed", "sautéed", "sauté", "sautéing"],
    "simmer": ["simmer", "simmered", "simmering"],
    "blanch": ["blanch", "blanched", "blanching"],
    "confit": ["confit"],
    "caramelize": ["caramelise", "caramelize", "caramelised", "caramelized"],
    "reduce": ["reduce", "reduced", "reduction"],
    "fry": ["fry", "fried", "frying", "deep-fry", "deep-fried"],
    "smoke": ["smoke", "smoked", "smoking"],
    "cure": ["cure", "cured", "curing"],
    "stew": ["stew", "stewed", "stewing"],
    "char": ["char", "charred", "charring"],
    "whip": ["whip", "whipped", "whipping"],
    "fold": ["fold", "folded", "folding"],
    "marinate": ["marinate", "marinated"],
    "glaze": ["glaze", "glazed"],
    "pickle": ["pickle", "pickled"],
    "puree": ["puree", "pureed", "purée", "puréed"],
}

BALANCE_LIGHT = ["light", "refreshing", "delicate", "crisp", "fresh", "bright", "clean", "zesty"]
BALANCE_HEAVY = ["rich", "hearty", "robust", "indulgent", "decadent", "warming", "generous", "comforting"]

SPECIFIC_TIMING_PATTERNS = [
    r"\d+\s*hours?\s*before",
    r"\d+\s*minutes?\s*before",
    r"morning\s+of",
    r"day\s+before",
    r"night\s+before",
    r"\d+\s*degrees",
    r"\d+\s*°",
]

PLATING_KEYWORDS = [
    "plate", "plating", "drizzle", "garnish", "arrange",
    "scatter", "spoon", "serve on", "serve in", "bowl",
    "presentation", "finish with", "top with", "dust",
]

PRACTICAL_KEYWORDS = [
    "oven", "temperature", "degrees", "rest", "resting",
    "warm", "warming", "cool", "cooling", "chill", "chilling",
    "refrigerate", "fridge", "timer", "thermometer",
    "serves", "portions", "leftovers", "reheat", "reheating",
]

SHOPPING_KEYWORDS = [
    "shopping", "butcher", "fishmonger", "greengrocer", "market",
    "farm shop", "source", "sourcing", "order", "buy",
]


def load_submission(path):
    """Load and parse the JSON submission."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Submission file not found: {path}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        return None


def _is_nut_ingredient(ingredient_lower):
    """Check if an ingredient contains nut keywords, with false-positive protection."""
    for kw in NUT_KEYWORDS:
        if kw in ingredient_lower:
            if kw in ("nut", "nuts"):
                if any(fp in ingredient_lower for fp in NUT_FALSE_POSITIVES):
                    continue
                return True
            else:
                return True
    return False


def _check_nut_in_text(text_lower):
    """Check if free text contains nut keywords, with false-positive protection."""
    for kw in NUT_KEYWORDS:
        if kw not in text_lower:
            continue
        if kw in ("nut", "nuts"):
            matches = list(re.finditer(r'\b' + re.escape(kw) + r'\b', text_lower))
            for m in matches:
                context_start = max(0, m.start() - 10)
                context = text_lower[context_start:m.end() + 2]
                if not any(fp in context for fp in NUT_FALSE_POSITIVES):
                    return True
        else:
            return True
    return False


def _is_seasonal(ingredient):
    for s in MARCH_SEASONAL:
        if s in ingredient or ingredient in s:
            return True
    return False


def _is_out_of_season(ingredient):
    for o in OUT_OF_SEASON:
        if o in ingredient or ingredient in o:
            return True
    return False


# ---------------------------------------------------------------------------
# 1. STRUCTURE (10 pts)
# ---------------------------------------------------------------------------
def score_structure(data):
    """All required fields present with minimum content quality. Max 10."""
    score = 0.0
    for course in ["starter", "main", "dessert"]:
        if course not in data or not isinstance(data[course], dict):
            continue
        c = data[course]

        # Name: >= 3 words (0.5 pts)
        name = c.get("name", "")
        if isinstance(name, str) and len(name.strip().split()) >= 3:
            score += 0.5
        elif isinstance(name, str) and len(name.strip()) > 0:
            score += 0.15

        # Description: >= 20 words (0.7 pts)
        desc = c.get("description", "")
        if isinstance(desc, str):
            wc = len(desc.strip().split())
            if wc >= 20:
                score += 0.7
            elif wc >= 10:
                score += 0.3
            elif wc > 0:
                score += 0.1

        # Ingredients: list with >= 5 items (0.7 pts)
        ingredients = c.get("ingredients", [])
        if isinstance(ingredients, list):
            if len(ingredients) >= 5:
                score += 0.7
            elif len(ingredients) >= 3:
                score += 0.3
            elif len(ingredients) >= 1:
                score += 0.1

        # prep_time: positive number (0.3 pts)
        prep = c.get("prep_time_minutes", None)
        if isinstance(prep, (int, float)) and prep > 0:
            score += 0.3

        # cook_time: positive number (0.3 pts)
        cook = c.get("cook_time_minutes", None)
        if isinstance(cook, (int, float)) and cook > 0:
            score += 0.3

    # wine_pairing: 3 fields (0.5 each)
    if "wine_pairing" in data and isinstance(data["wine_pairing"], dict):
        wp = data["wine_pairing"]
        for field in ["starter_wine", "main_wine", "dessert_wine"]:
            val = wp.get(field, "")
            if isinstance(val, str) and len(val.strip()) > 10:
                score += 0.5
            elif isinstance(val, str) and len(val.strip()) > 0:
                score += 0.15

    # hosting_notes (1 pt for >= 30 words)
    notes = data.get("hosting_notes", "")
    if isinstance(notes, str):
        wc = len(notes.strip().split())
        if wc >= 30:
            score += 1.0
        elif wc >= 10:
            score += 0.4

    return min(10, round(score))


# ---------------------------------------------------------------------------
# 2. SEASONALITY (25 pts)
# ---------------------------------------------------------------------------
def score_seasonality(data):
    """Reward March ingredients, penalise out-of-season. Max 25.

    - Seasonal ratio:           up to 14 pts
    - Out-of-season penalty:    -3 each
    - Hero seasonal bonus:      up to 5 pts
    - All-courses-seasonal:     +3
    - Seasonal depth (>= 8):    +3
    """
    all_ingredients = []
    per_course_seasonal = {"starter": False, "main": False, "dessert": False}

    for course in ["starter", "main", "dessert"]:
        if course in data and isinstance(data[course], dict):
            ingredients = data[course].get("ingredients", [])
            if isinstance(ingredients, list):
                course_ings = [i.lower().strip() for i in ingredients if isinstance(i, str)]
                all_ingredients.extend(course_ings)
                for ing in course_ings:
                    if _is_seasonal(ing):
                        per_course_seasonal[course] = True
                        break

    if not all_ingredients:
        return 0

    seasonal_count = 0
    out_of_season_count = 0
    unique_seasonal = set()

    for ingredient in all_ingredients:
        if _is_seasonal(ingredient):
            seasonal_count += 1
            for s in MARCH_SEASONAL:
                if s in ingredient or ingredient in s:
                    unique_seasonal.add(s)
                    break
        if _is_out_of_season(ingredient):
            out_of_season_count += 1

    total = len(all_ingredients)
    ratio = seasonal_count / total if total > 0 else 0

    # Seasonal ratio: up to 14 pts
    score = ratio * 14.0

    # Penalty
    score -= out_of_season_count * 3

    # Hero bonus: up to 5 pts
    unique_heroes = set()
    for ingredient in all_ingredients:
        for h in HERO_SEASONAL:
            if h in ingredient or ingredient in h:
                unique_heroes.add(h)
                break
    if len(unique_heroes) >= 4:
        score += 5
    elif len(unique_heroes) >= 3:
        score += 4
    elif len(unique_heroes) >= 2:
        score += 3
    elif len(unique_heroes) >= 1:
        score += 1.5

    # All courses seasonal: +3
    if all(per_course_seasonal.values()):
        score += 3

    # Depth: unique seasonal count — need really high variety
    if len(unique_seasonal) >= 12:
        score += 3
    elif len(unique_seasonal) >= 9:
        score += 2
    elif len(unique_seasonal) >= 6:
        score += 1

    return max(0, min(25, round(score)))


# ---------------------------------------------------------------------------
# 3. CREATIVITY & BALANCE (25 pts)
# ---------------------------------------------------------------------------
def score_creativity(data):
    """Method variety, course contrast, ingredient diversity, description quality,
    nut-free. Max 25.

    - Cooking methods:        up to 7 pts (>= 10 distinct for full)
    - Course contrast:        up to 4 pts
    - Ingredient diversity:   up to 6 pts (>= 35 unique for full)
    - Description quality:    up to 5 pts (>= 50 words + technique each)
    - Not pretentious:        up to 1 pt
    - Nut-free:               +1 bonus / -10 penalty
    """
    score = 0.0
    all_text = ""
    all_ingredients = []
    course_texts = {}

    for course in ["starter", "main", "dessert"]:
        if course in data and isinstance(data[course], dict):
            c = data[course]
            ct = (c.get("name", "") + " " + c.get("description", "")).lower()
            course_texts[course] = ct
            all_text += " " + c.get("name", "") + " " + c.get("description", "")
            ingredients = c.get("ingredients", [])
            if isinstance(ingredients, list):
                all_ingredients.extend([i.lower().strip() for i in ingredients if isinstance(i, str)])
                all_text += " " + " ".join(str(i) for i in ingredients)

    all_text_lower = all_text.lower()

    # 1. Cooking method variety (max 7)
    # Need >= 8 distinct methods for full marks — really demanding
    methods_found = set()
    for base_method, variants in COOKING_METHODS.items():
        for variant in variants:
            if variant in all_text_lower:
                methods_found.add(base_method)
                break
    mc = len(methods_found)
    if mc >= 10:
        score += 7
    elif mc >= 8:
        score += 5.5
    elif mc >= 6:
        score += 4
    elif mc >= 4:
        score += 2.5
    elif mc >= 2:
        score += 1

    # 2. Course contrast (max 4)
    light_courses = set()
    heavy_courses = set()
    for course in ["starter", "main", "dessert"]:
        ct = course_texts.get(course, "")
        if any(w in ct for w in BALANCE_LIGHT):
            light_courses.add(course)
        if any(w in ct for w in BALANCE_HEAVY):
            heavy_courses.add(course)

    balance_types = 0
    if light_courses:
        balance_types += 1
    if heavy_courses:
        balance_types += 1

    if len(heavy_courses) == 3 or len(light_courses) == 3:
        score += 0
    elif balance_types >= 2:
        score += 4
    elif balance_types == 1:
        score += 1.5

    # 3. Ingredient diversity (max 6) — very demanding thresholds
    unique_ingredients = set(all_ingredients)
    uc = len(unique_ingredients)
    if uc >= 35:
        score += 6
    elif uc >= 30:
        score += 4.5
    elif uc >= 25:
        score += 3
    elif uc >= 20:
        score += 2
    elif uc >= 15:
        score += 1
    # < 15 = 0

    # 4. Description quality (max 5)
    technique_words = set()
    for variants in COOKING_METHODS.values():
        technique_words.update(variants)

    desc_score = 0.0
    for course in ["starter", "main", "dessert"]:
        if course in data and isinstance(data[course], dict):
            desc = data[course].get("description", "")
            if isinstance(desc, str):
                wc = len(desc.strip().split())
                desc_lower = desc.lower()
                has_technique = any(t in desc_lower for t in technique_words)
                if wc >= 50 and has_technique:
                    desc_score += 1.67
                elif wc >= 35 and has_technique:
                    desc_score += 1.1
                elif wc >= 25 and has_technique:
                    desc_score += 0.7
                elif wc >= 25:
                    desc_score += 0.4
                elif wc >= 15:
                    desc_score += 0.2
    score += min(5, desc_score)

    # 5. Not pretentious (max 1)
    pretentious_kws = [
        "foam", "foams", "gel", "gels", "spherification", "sous vide",
        "dehydrated", "nitrogen", "liquid nitrogen",
    ]
    if not any(kw in all_text_lower for kw in pretentious_kws):
        score += 1

    # 6. Nut-free — hard constraint
    has_nuts = any(_is_nut_ingredient(ing) for ing in all_ingredients)
    if not has_nuts:
        has_nuts = _check_nut_in_text(all_text_lower)
    if has_nuts:
        score -= 10
    else:
        score += 1

    return max(0, min(25, round(score)))


# ---------------------------------------------------------------------------
# 4. FEASIBILITY (20 pts)
# ---------------------------------------------------------------------------
def score_feasibility(data):
    """Realistic times, constraints, quick course, make-ahead. Max 20.

    - Times valid:                  +2
    - Per-course prep >= 5 min:     +1 each (3 total)
    - Total active time:            up to 5 pts
    - Quick course (cook <= 15):    +2
    - Make-ahead (specific):        +4 / vague: +2
    - Per-course sanity:            -1 per course > 120 min total
    """
    score = 0.0
    total_active_minutes = 0
    all_times_valid = True
    has_quick_course = False
    course_times = []

    for course in ["starter", "main", "dessert"]:
        if course not in data or not isinstance(data[course], dict):
            all_times_valid = False
            continue
        c = data[course]
        prep = c.get("prep_time_minutes", -1)
        cook = c.get("cook_time_minutes", -1)

        if not isinstance(prep, (int, float)) or not isinstance(cook, (int, float)):
            all_times_valid = False
            continue
        if prep < 0 or cook < 0:
            all_times_valid = False
            continue

        total_active_minutes += prep + cook
        course_times.append((course, prep, cook))

        if prep >= 5:
            score += 1.0

        if 0 < cook <= 15:
            has_quick_course = True

    if all_times_valid and total_active_minutes > 0:
        score += 2

    if all_times_valid and total_active_minutes > 0:
        if total_active_minutes <= 120:
            score += 5
        elif total_active_minutes <= 150:
            score += 4
        elif total_active_minutes <= 180:
            score += 2.5
        elif total_active_minutes <= 240:
            score += 1

    if has_quick_course:
        score += 2

    # Per-course sanity — deduct if unreasonable
    if course_times:
        for (cname, prep, cook) in course_times:
            if prep + cook > 120:
                score -= 1  # penalise excessively long single courses

    # Make-ahead
    hosting_notes = ""
    if "hosting_notes" in data and isinstance(data["hosting_notes"], str):
        hosting_notes = data["hosting_notes"].lower()

    all_desc_text = hosting_notes
    for course in ["starter", "main", "dessert"]:
        if course in data and isinstance(data[course], dict):
            all_desc_text += " " + data[course].get("description", "").lower()

    make_ahead_triggers = [
        "make ahead", "make-ahead", "day before", "night before",
        "in advance", "ahead of time", "can be made",
        "prepare earlier", "the day before",
    ]

    specific_make_ahead = False
    vague_make_ahead = False

    for kw in make_ahead_triggers:
        if kw in hosting_notes:
            has_time_ref = any(re.search(p, hosting_notes) for p in SPECIFIC_TIMING_PATTERNS)
            if has_time_ref:
                specific_make_ahead = True
            else:
                vague_make_ahead = True
            break

    if not specific_make_ahead and not vague_make_ahead:
        for kw in make_ahead_triggers:
            if kw in all_desc_text:
                vague_make_ahead = True
                break

    if specific_make_ahead:
        score += 4
    elif vague_make_ahead:
        score += 2

    return min(20, round(score))


# ---------------------------------------------------------------------------
# 5. WINE PAIRING (15 pts)
# ---------------------------------------------------------------------------
def score_wine_pairing(data):
    """Specific grapes, regions, tasting notes, course appropriateness. Max 15.

    Per wine (5 pts each):
      - Grape variety:     +1.5
      - Region:            +1.5
      - Tasting note:      +1  (> 60 chars + >= 3 flavor descriptors)
      - Appropriateness:   +1
    """
    if "wine_pairing" not in data or not isinstance(data["wine_pairing"], dict):
        return 0

    wp = data["wine_pairing"]
    score = 0.0

    white_indicators = [
        "white", "vermentino", "chardonnay", "sauvignon blanc",
        "riesling", "pinot grigio", "albarino", "gruner",
        "chenin blanc", "viognier", "fiano", "rose", "rosé",
    ]
    red_indicators = [
        "red", "pinot noir", "cabernet", "merlot", "syrah", "shiraz",
        "grenache", "tempranillo", "sangiovese", "nebbiolo", "malbec",
        "gamay", "mourvedre", "blend",
    ]
    sweet_indicators = [
        "moscato", "muscat", "sauternes", "tokaji", "dessert",
        "sweet", "d'asti", "late harvest", "ice wine", "passito",
        "vin santo",
    ]

    for field in ["starter_wine", "main_wine", "dessert_wine"]:
        wine_text = wp.get(field, "")
        if not isinstance(wine_text, str) or len(wine_text.strip()) < 5:
            continue

        wine_lower = wine_text.lower()
        field_score = 0.0

        grape_found = any(g in wine_lower for g in GRAPE_VARIETIES)
        region_found = any(r in wine_lower for r in WINE_REGIONS)

        if grape_found:
            field_score += 1.5
        if region_found:
            field_score += 1.5

        # Tasting note > 100 chars with >= 4 distinct flavor descriptors
        if len(wine_text.strip()) > 100:
            descriptor_count = sum(1 for d in WINE_FLAVOR_DESCRIPTORS if d in wine_lower)
            if descriptor_count >= 5:
                field_score += 1.0
            elif descriptor_count >= 3:
                field_score += 0.5
        elif len(wine_text.strip()) > 60:
            descriptor_count = sum(1 for d in WINE_FLAVOR_DESCRIPTORS if d in wine_lower)
            if descriptor_count >= 4:
                field_score += 0.5

        # Appropriateness only counts if wine is specific enough (has grape OR region)
        if grape_found or region_found:
            if field == "starter_wine" and any(w in wine_lower for w in white_indicators):
                field_score += 1.0
            elif field == "main_wine" and any(w in wine_lower for w in red_indicators):
                field_score += 1.0
            elif field == "dessert_wine" and any(w in wine_lower for w in sweet_indicators):
                field_score += 1.0

        score += field_score

    return min(15, round(score))


# ---------------------------------------------------------------------------
# 6. HOSTING NOTES (5 pts)
# ---------------------------------------------------------------------------
def score_hosting_notes(data):
    """Hosting notes quality. Max 5.

    - Specific timeline (>= 3 time refs): +2, (1-2): +1
    - Plating details:                    +1
    - Practical (temps, resting):         +1
    - Shopping/sourcing tip:              +1
    """
    notes = data.get("hosting_notes", "")
    if not isinstance(notes, str):
        return 0

    notes_lower = notes.lower()
    word_count = len(notes.split())

    if word_count < 10:
        return 0

    score = 0.0

    timing_matches = 0
    for pattern in SPECIFIC_TIMING_PATTERNS:
        if re.search(pattern, notes_lower):
            timing_matches += 1
    if timing_matches >= 3:
        score += 2
    elif timing_matches >= 1:
        score += 1

    plating_found = sum(1 for kw in PLATING_KEYWORDS if kw in notes_lower)
    if plating_found >= 2:
        score += 1

    practical_found = sum(1 for kw in PRACTICAL_KEYWORDS if kw in notes_lower)
    if practical_found >= 2:
        score += 1

    if any(kw in notes_lower for kw in SHOPPING_KEYWORDS):
        score += 1

    return min(5, round(score))


# ---------------------------------------------------------------------------
# Evaluate
# ---------------------------------------------------------------------------
def evaluate(data):
    """Run all scoring categories and return total."""
    structure = score_structure(data)
    seasonality = score_seasonality(data)
    creativity = score_creativity(data)
    feasibility = score_feasibility(data)
    wine = score_wine_pairing(data)
    hosting = score_hosting_notes(data)

    print(f"Structure:      {structure}/10", file=sys.stderr)
    print(f"Seasonality:    {seasonality}/25", file=sys.stderr)
    print(f"Creativity:     {creativity}/25", file=sys.stderr)
    print(f"Feasibility:    {feasibility}/20", file=sys.stderr)
    print(f"Wine pairing:   {wine}/15", file=sys.stderr)
    print(f"Hosting notes:  {hosting}/5", file=sys.stderr)

    total = structure + seasonality + creativity + feasibility + wine + hosting
    return min(100, max(0, total))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

data = load_submission(submission_file)
if data is None:
    print("SCORE: 0")
    sys.exit(0)

if not isinstance(data, dict):
    print("Submission must be a JSON object", file=sys.stderr)
    print("SCORE: 0")
    sys.exit(0)

total = evaluate(data)
print(f"SCORE: {total}")
