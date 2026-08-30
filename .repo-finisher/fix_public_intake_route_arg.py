from pathlib import Path
p = Path('components/PublicIntake.tsx')
text = p.read_text()
old = "          firmId:         firmId ?? undefined,\n"
new = "          routeToken:     token,\n"
if text.count(old) != 1:
    raise SystemExit(f'expected one remaining firmId checkpoint arg, found {text.count(old)}')
p.write_text(text.replace(old, new, 1))
print('fixed remaining public intake route argument')
