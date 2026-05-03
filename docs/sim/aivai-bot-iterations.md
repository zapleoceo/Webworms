## 2026-05-03

### Iteration 1

- PitAnalyzer: исправлен поиск поверхности (по границе solid/air), чтобы rim/surface не “прилипал” к глубине в solid-колонках.
- Escape dig: выбор точки подрыва с учётом selfSafe (ищем попадание не ближе `selfSafe+12`), увеличены углы/пауэр для dig-escape.
- Trap attack: усилен выбор гранаты по trapped-цели (доп. бонус за “вписывание” в hit tolerance).
- Best practices: добавлены templates (EMA success) + предпочтение jump/rope/dig на основе шаблонов; запись template результата на смене хода.

