import { Schema, JSONSchema, SchemaAST as AST, ParseResult, Either } from "effect";
const Signup = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2, { message: () => "Enter at least 2 characters" })),
  age: Schema.NumberFromString.pipe(Schema.int(), Schema.between(18, 120)),
  email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+$/)),
  plan: Schema.Literal("free", "pro"),
  terms: Schema.Literal(true),
  bio: Schema.optional(Schema.String.pipe(Schema.maxLength(140))),
});
// 1. what the manifest derivation sees (refinement -> from)
const walk = (ast, path = "") => { switch (ast._tag) { case "TypeLiteral": return ast.propertySignatures.map(p => walk(p.type, p.name)); case "Refinement": return `${path}: Refinement(${walk(ast.from)}) annotations=${JSON.stringify(Object.fromEntries(Object.getOwnPropertySymbols(ast.annotations).map(s => [String(s), ast.annotations[s]]).filter(([k]) => /jsonSchema|message|title|description/i.test(k))))}`; case "Transformation": return `${path}: Transformation(${ast.from._tag}->${ast.to._tag})`; case "Union": return `${path}: Union(${ast.types.map(t => t._tag).join(",")})`; default: return `${path}: ${ast._tag}`; } };
console.log(JSON.stringify(walk(Signup.ast), null, 1));
// 2. JSON Schema derivation (constraints survive here?)
try { console.log(JSON.stringify(JSONSchema.make(Signup))); } catch (e) { console.log("JSONSchema.make failed:", String(e.message).slice(0, 160)); }
try { console.log(JSON.stringify(JSONSchema.make(Schema.typeSchema(Signup)))); } catch (e) { console.log("JSONSchema.make(typeSchema) failed:", String(e.message).slice(0, 160)); }
// 3. errors per field from one decode
const bad = { name: "A", age: "7.5", email: "nope", plan: "gold", terms: false, bio: "x".repeat(200) };
const r = Schema.decodeUnknownEither(Signup, { errors: "all" })(bad);
if (Either.isLeft(r)) { const issues = ParseResult.ArrayFormatter.formatErrorSync(r.left); console.log(issues.map(i => `${i.path.join(".")}: ${i._tag} "${i.message}"`).join("\n")); }
// 4. first error only (default)
const r2 = Schema.decodeUnknownEither(Signup)(bad); if (Either.isLeft(r2)) console.log("default (first only):", ParseResult.ArrayFormatter.formatErrorSync(r2.left).length, "issue(s)");
// 5. validation of a single field in isolation (per-keystroke)
const nameField = Schema.make(Signup.ast.propertySignatures[0].type); console.log("field-level decode of 'A':", Either.isLeft(Schema.decodeUnknownEither(nameField)("A")), "of 'Al':", Either.isRight(Schema.decodeUnknownEither(nameField)("Al")));
// 6. async refinement (uniqueness check) is not expressible in Schema.decodeUnknownSync
console.log("effectful filter possible:", typeof Schema.filterEffect);
