import { parse, rule, type Rule } from 'postcss';

/** Edit the last top-level :scope rule, preserving comments and unrelated rules. */
export function editCssDeclarations(css: string, changes: Record<string, string>): string {
  const root = parse(css);
  let target = root.nodes.filter((node): node is Rule => node.type === 'rule' && node.selector.trim() === ':scope').at(-1);
  if (!target) { target = rule({ selector: ':scope' }); root.append(target); }
  for (const [prop, value] of Object.entries(changes)) {
    const declarations = target.nodes.filter(node => node.type === 'decl' && node.prop === prop);
    const last = declarations.at(-1);
    if (!value.trim()) declarations.forEach(node => node.remove());
    else if (last?.type === 'decl') last.value = value;
    else target.append({ prop, value });
  }
  return root.toString();
}
