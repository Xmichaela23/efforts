/**
 * efforts/consistent-button-shape
 *
 * Keeps button SHAPE from drifting per-element again (the 2026-08-11 design-system pass).
 * THE RULE: a tappable `<button>` is rounded-xl — ideally via the shared <GalaxyButton>
 * (src/components/ui/galaxy-button.tsx), which owns radius + state so it cannot drift.
 *
 * This flags a raw `<button className="… rounded-full | rounded-2xl | rounded-lg | rounded-md |
 * rounded-sm | rounded-3xl …">`, i.e. any radius that is NOT the rounded-xl standard.
 *
 * DELIBERATE EXCEPTIONS (not flagged):
 *   • True circular controls — a FAB, a numeric stepper, a close-X — carry explicit square
 *     dimensions (`h-9 w-9`, `size-9`). Those are meant to be round; the presence of h+w (or size)
 *     is the tell, so they pass.
 *   • Genuine one-off intent: add `// eslint-disable-next-line efforts/consistent-button-shape`
 *     with a reason. Chips render through <GalaxyButton shape="chip">, so a raw rounded-full chip
 *     should move to that instead of being disabled.
 *
 * Progress bars, badges and tags are not <button> and are never scanned.
 */

const OFF_STANDARD = /\brounded-(?:full|3xl|2xl|lg|md|sm)\b/;
const HAS_H = /\bh-\d/;
const HAS_W = /\bw-\d/;
const HAS_SIZE = /\bsize-\d/;

/** Flatten every static string an expression can contribute to a className. */
function collectStrings(node) {
  if (!node) return "";
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? node.value : "";
    case "TemplateLiteral":
      return (
        node.quasis.map((q) => q.value.cooked).join(" ") +
        " " +
        node.expressions.map(collectStrings).join(" ")
      );
    case "ConditionalExpression":
      return collectStrings(node.consequent) + " " + collectStrings(node.alternate);
    case "BinaryExpression":
    case "LogicalExpression":
      return collectStrings(node.left) + " " + collectStrings(node.right);
    case "CallExpression": // cn("…", cond && "…")
      return node.arguments.map(collectStrings).join(" ");
    case "ArrayExpression":
      return node.elements.map(collectStrings).join(" ");
    default:
      return "";
  }
}

function classNameText(attrValue) {
  if (!attrValue) return "";
  if (attrValue.type === "Literal") {
    return typeof attrValue.value === "string" ? attrValue.value : "";
  }
  if (attrValue.type === "JSXExpressionContainer") {
    return collectStrings(attrValue.expression);
  }
  return "";
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Tappable <button>s use one shape (rounded-xl, via <GalaxyButton>). Prevents per-element radius drift.",
    },
    schema: [],
    messages: {
      offStandard:
        'Button radius "{{token}}" is off-standard. Buttons are rounded-xl — route this through <GalaxyButton> (src/components/ui/galaxy-button.tsx), or use rounded-xl. Genuine chips → <GalaxyButton shape="chip">. True circular controls carry h-/w-/size- dims and are exempt; a one-off can eslint-disable this line with a reason.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (
          !node.name ||
          node.name.type !== "JSXIdentifier" ||
          node.name.name !== "button"
        ) {
          return;
        }
        const classAttr = node.attributes.find(
          (a) =>
            a.type === "JSXAttribute" && a.name && a.name.name === "className",
        );
        if (!classAttr) return;

        const text = classNameText(classAttr.value);
        const match = text.match(OFF_STANDARD);
        if (!match) return;

        // Exempt true circular controls: explicit square dimensions.
        if ((HAS_H.test(text) && HAS_W.test(text)) || HAS_SIZE.test(text)) return;

        context.report({
          node: classAttr,
          messageId: "offStandard",
          data: { token: match[0] },
        });
      },
    };
  },
};
