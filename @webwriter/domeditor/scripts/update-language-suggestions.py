"""Generate the toolbox's compact language population snapshot.

Download https://raw.githubusercontent.com/unicode-org/cldr/release-48/common/supplemental/supplementalData.xml
then run: python3 scripts/update-language-suggestions.py /path/to/supplementalData.xml

CLDR populationPercent estimates speakers (including second-language speakers),
not just native speakers. Script variants can overlap, so use the largest
population for each base language in each territory before summing worldwide.
Country eligibility includes UN members, observers, Kosovo, Taiwan, Cook
Islands and Niue. Regional-only languages and dependent territories do not
contribute suggestions, but their speakers count toward worldwide totals.
"""

import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


# National status corrections to CLDR's operational classification.
# https://www.gov.za/about-sa/south-africa-glance
# https://www.constituteproject.org/constitution/Mali_2023
# https://www.unicef.org/wca/media/9196/file/Etude%20MLE%20-%20rapport%20complet.pdf
# https://www.soas.ac.uk/amharic-language-courses
# https://moj.gov.iq/upload/pdf/قانون_اللغات_الرسمية.pdf
# https://www.fedlex.admin.ch/eli/cc/1999/404/en (Article 70)
national_languages = {
    "ZA": "en zu xh af nso tn st ts ss ve nr sfs".split(),
    "ML": "bm ffm snk mwk ses tmh khq dtm kao bmq bze myk mey".split(),
    "ET": "am om so ti aa".split(),
    "IQ": "ar ku".split(),
    "CH": "de fr it rm".split(),
}

# CLDR does not include sign-language populations. NZSL is among NZ's three
# official languages. South African and PNG sign languages fall below the cap.
# https://www.nzsl.govt.nz/news/nzsl-board-seeks-feedback-on-draft-nzsl-strategy
extra_populations = {"NZ": {"nzs": 24678}}


def base_language(code):
    # Iraq recognizes Kurdish, covering CLDR's Central Kurdish and Kurmanji.
    return "ku" if code == "ckb" else code.split("_")[0]


root = ET.parse(sys.argv[1]).getroot()
countries = set(root.find(".//territoryContainment/group[@type='UN']").get("contains").split())
countries.update("VA PS XK TW CK NU".split())
populations = {}
country_languages = {}
for territory in root.findall(".//territoryInfo/territory"):
    country = territory.get("type")
    population = float(territory.get("population"))
    speakers = {}
    official = set()
    for language in territory:
        code = base_language(language.get("type"))
        count = population * float(language.get("populationPercent")) / 100
        speakers[code] = max(speakers.get(code, 0), count)
        if language.get("officialStatus") in ("official", "de_facto_official"):
            official.add(code)
    if country in national_languages:
        official = set(national_languages[country])
    speakers.update(extra_populations.get(country, {}))
    official.update(extra_populations.get(country, {}))
    for code, count in speakers.items():
        populations[code] = populations.get(code, 0) + count
    if country in countries:
        ranked = sorted(official, key=lambda code: (-speakers.get(code, 0), code))
        if ranked:
            country_languages[country] = ranked[:3]

eligible = set(code for codes in country_languages.values() for code in codes)
snapshot = {
    "speakers": {code: round(populations[code]) for code in sorted(eligible)},
    "countries": dict(sorted(country_languages.items())),
}
destination = Path(__file__).resolve().parents[1] / "src/language-suggestions-data.json"
# Keep each country on one line for easy review.
lines = ['{', '  "speakers": {']
lines += [f'    {json.dumps(code)}: {count},' for code, count in snapshot["speakers"].items()]
lines[-1] = lines[-1].rstrip(',')
lines += ['  },', '  "countries": {']
lines += [f'    {json.dumps(country)}: {json.dumps(codes)},' for country, codes in snapshot["countries"].items()]
lines[-1] = lines[-1].rstrip(',')
lines += ['  }', '}']
destination.write_text('\n'.join(lines) + '\n')
