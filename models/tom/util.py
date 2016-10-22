REPO_ROOT = "/usr/src/app"

import json
import re
import string

def tokenize_js(script):
    script = re.sub(r'(\/\*[^*]+\*\/)', "", script)
    script = re.sub(r'\/\/.+', "", script)
    tokens = re.findall(r'([A-Z][a-z]+|[A-Z]+|[a-z]+|[\-\\\/_{}\"\',\(\)\.]|[\+\*]|/\*.+\*\/)', script)
    return [
        t.lower() if (len(t) != 1 or t.lower() not in string.lowercase) else "x"
        for t in tokens
    ]

def parse_js(tbl):
    for item in tbl:
        with open("%s/scripts/%s.js" % (REPO_ROOT, item["sha"])) as f:
            yield f.read().decode(errors='replace')

def _tokenize_helper(node):
    if isinstance(node, basestring):
        return [node]
    if isinstance(node, bool):
        return ["True" if node else "False"]
    if isinstance(node, list):
        return [x for v in node for x in _tokenize_helper(v)]
    if node is None:
        return []

    lst = [".".join([
        "%s:%s" % (key, val)
        for key, val in node.iteritems()
        if not isinstance(val, dict) and not isinstance(val, list)
    ])]

    for key, val in node.iteritems():
        if isinstance(val, dict) or isinstance(val, list):
            lst += _tokenize_helper(val)

    return lst

def tokenize_ast(ast):
    try:
        ast_json = json.loads(ast)
    except Exception as e:
        print "Failed to parse JSON! %s" % str(e)
        return []
    return [t.lower() for t in _tokenize_helper(ast_json)]

def parse_ast(tbl):
    for item in tbl:
        try:
            with open("%s/scripts-ast/%s.js.ast" % (REPO_ROOT, item["sha"])) as f:
                yield f.read()
        except IOError:
            yield "[]"
