from __future__ import print_function
from itertools import combinations
from collections import Counter
import re

def identifiers(ast, path=[]):
    if isinstance(ast, dict) and 'type' in ast:
        if ast['type'] == 'Identifier':
            yield ast['name'], path
        else:
            keys = sorted(ast.keys())
            ast_type = ast['type']
            for k in keys:
                for entry in identifiers(ast[k], path + [ast, ast[k]]):
                    yield entry
    elif isinstance(ast, list):
        for a in ast:
            for entry in identifiers(a, path):
                yield entry

all_types = [
 u'ArrayExpression',
 u'AssignmentExpression',
 u'BinaryExpression',
 u'BlockStatement',
 u'BreakStatement',
 u'CallExpression',
 u'CatchClause',
 u'ConditionalExpression',
 u'ContinueStatement',
 u'DoWhileStatement',
 u'EmptyStatement',
 u'ExpressionStatement',
 u'ForInStatement',
 u'ForStatement',
 u'FunctionDeclaration',
 u'FunctionExpression',
 u'Identifier',
 u'IfStatement',
 u'LabeledStatement',
 u'Literal',
 u'LogicalExpression',
 u'MemberExpression',
 u'NewExpression',
 u'ObjectExpression',
 u'Program',
 u'Property',
 u'ReturnStatement',
 u'SequenceExpression',
 u'SwitchCase',
 u'SwitchStatement',
 u'ThisExpression',
 u'ThrowStatement',
 u'TryStatement',
 u'UnaryExpression',
 u'UpdateExpression',
 u'VariableDeclaration',
 u'VariableDeclarator',
 u'WhileStatement',
 u'WithStatement'
]
n = len(all_types)
type_dict = dict(zip(all_types, range(n)))

def common_ancestry(path1, path2):
    ancestor = None
    length = min(len(path1), len(path2))
    if length == 0:
        return ancestor
    if abs(len(path1) - len(path2)) > 10:
        return ancestor
    i = 0
    while i < length and path1[i] == path2[i]:
        if isinstance(path1[i], dict) and 'type' in path1[i]:
            ancestor = path1[i]
        i = i + 1
    if len(path1) - 1 < 10 and len(path2) - i < 10:
        return type_dict[ancestor['type']]
    else:
        return None

alpha = re.compile('^[a-zA-Z]$')
def should_drop_ident(*names):
    drop = False
    for name in names:
        if alpha.match(name) is not None:
            return True
    return drop


def tagged_idents(idents):
    combos = combinations(idents, 2)
    for (name1, path1), (name2, path2) in combos:
        if not should_drop_ident(name1, name2):
            ancestor = common_ancestry(path1, path2)
            if ancestor is not None:
                yield name1, name2, ancestor


if __name__ == '__main__':
    import fileinput
    import json
    import sys
    for line_no, line in enumerate(fileinput.input()):
        id_or_label, ast = line.strip().split('\t')
        ast = json.loads(ast)
        entries = tagged_idents(identifiers(ast, []))
        value = Counter()
        for e in entries:
            value["{}|{}|{}".format(*e)] += 1
        print("{}\t{}".format(id_or_label, json.dumps(value)), file=sys.stdout)
        print("Line: {}".format(line_no+1), file=sys.stderr)
