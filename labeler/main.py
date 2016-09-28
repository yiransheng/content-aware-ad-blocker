import json

from adblockparser import AdblockRules

def load_rules(name):
    with open("/app/%s.txt" % name, "r") as f:
        raw_rules = f.readlines()

    return AdblockRules(raw_rules)

rulesets = {}
counts = {"total": 0, "any": 0}
for name in ["easyprivacy", "easylist", "fanboy-social", "fanboy-annoyance"]:
    rulesets[name] = load_rules(name)
    counts["flag-%s" % name] = 0

with open("/var/scripts/table.json", "r") as f:
    table = json.load(f)

flag_count, noflag_count = 0, 0
for item in table:
    url, sha = item["url"], item["sha"]

    first = True
    for name, rules in rulesets.iteritems():
        flag = rules.should_block(url)

        if flag:
            counts["flag-%s" % name] += 1
            if first:
                counts["any"] += 1
                first = False

        item["flag-%s" % name] = 1 if flag else 0

    item["flag-any"] = 0 if first else 1
    counts["total"] += 1

for name, count in counts.iteritems():
    print "%s: %d" % (name, count)

with open("/var/scripts/table_flag.json", "w") as f:
    json.dump(table, f)
