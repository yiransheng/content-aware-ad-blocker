from collections import  defaultdict, Counter
import uuid

def normalize_ast(ast):
    tree = defaultdict(list)
    _go(ast, None, tree)
    return tree
def _go(ast, parent, tree):
    if isinstance(ast, dict) and "type" in ast:
        node = (uuid.uuid4(), ast['type'])
        if parent is not None:
            tree[parent].append(node)
        keys = sorted(ast.keys())
        for k in keys:
            _go(ast[k], node, tree)
    elif isinstance(ast, list):
        node = (uuid.uuid4(), 'BodyList')
        tree[parent].append(node)
        for a in ast:
            _go(a, node, tree)

def to_btree(t):
    binary_tree = defaultdict(lambda: [None, None])
    for node, children in t.iteritems():
        if len(children) > 0:
           binary_tree[node][0] = children[0]
    for siblings in t.values():
        pairs = zip(siblings, siblings[1:])
        for left, right in pairs:
            binary_tree[left][1] = right
    return binary_tree

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
 u'WithStatement',
 u'BodyList',
 u'None'
]
n = len(all_types)
type_dict = dict(zip(all_types, range(n)))

def encode_node(n):
    if n is None:
        type = 'None'
    else:
        id, type = n
    return type_dict[type]
def encode_btree(btree):
    counts = Counter()
    for node, [left, right] in btree.iteritems():
        key = "{}|{}|{}".format(encode_node(node),
                                encode_node(left),
                                encode_node(right))
        counts[key] += 1
    return counts

if __name__ == '__main__':
    import fileinput
    import json
    for line in fileinput.input():
        try:
            id_or_label, ast = line.strip().split('\t')
            ast = json.loads(ast)
            tree = normalize_ast(ast)
            btree = to_btree(tree)
            encoding = json.dumps( encode_btree(btree) )
            print "{}\t{}".format(id_or_label, encoding)
        except:
            pass
