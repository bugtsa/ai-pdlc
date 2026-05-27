# Подключение AI-PDLC MCP к Codex

Этот файл — короткий runbook для подключения MCP-сервера `ai_pdlc` к `Codex`.

## Что делает `setup-codex`

Команда `ai-pdlc setup-codex` делает две вещи:

1. Копирует bundled skill в `~/.codex/skills/ai-pdlc`
2. Регистрирует MCP-сервер в Codex под именем `ai_pdlc`

Проверить текущее состояние MCP в Codex можно так:

```bash
codex mcp list --json
codex mcp get ai_pdlc --json
```

## Рекомендуемый путь: macOS

Установить CLI:

```bash
brew install bugtsa/ai-pdlc/ai-pdlc
```

Зарегистрировать MCP для нужного репозитория:

```bash
ai-pdlc setup-codex --repo-root /absolute/path/to/your/repo
```

Проверить:

```bash
ai-pdlc doctor --repo-root /absolute/path/to/your/repo --json
codex mcp get ai_pdlc --json
```

Если Codex раньше закешировал неудачный старт сервера, после настройки перезапусти клиент Codex.

## Рекомендуемый путь: Windows

Требования:

1. Установить Node.js LTS и убедиться, что `node` есть в `PATH`
2. Скачать актуальный Windows portable zip с:

`https://github.com/bugtsa/ai-pdlc/releases/latest`

Распаковать в постоянную директорию, например:

```text
C:\Tools\ai-pdlc
```

Зарегистрировать MCP для нужного репозитория:

```powershell
C:\Tools\ai-pdlc\bin\ai-pdlc.exe setup-codex --repo-root D:\path\to\your\repo
```

Проверить:

```powershell
C:\Tools\ai-pdlc\bin\ai-pdlc.exe doctor --repo-root D:\path\to\your\repo --json
codex mcp get ai_pdlc --json
```

Важно:

- Не перемещай распакованную папку после настройки. Codex сохраняет путь к launcher в своём MCP config.
- Если Codex до этого показывал `failed`, после настройки перезапусти клиент.

## Ручной fallback

Используй это только если не хочешь запускать `setup-codex`.

### macOS / Linux

Если `ai-pdlc` уже есть в `PATH`:

```bash
codex mcp remove ai_pdlc
codex mcp add ai_pdlc --env AI_PDLC_REPO_ROOT=/absolute/path/to/your/repo -- ai-pdlc mcp-serve
```

### Windows

Здесь лучше явно указать Node entrypoint из распакованного пакета:

```powershell
codex mcp remove ai_pdlc
codex mcp add ai_pdlc --env AI_PDLC_REPO_ROOT=D:\path\to\your\repo -- node C:\Tools\ai-pdlc\src\bin\ai-pdlc.mjs mcp-serve
```

## Обновление

### macOS

```bash
brew upgrade bugtsa/ai-pdlc/ai-pdlc
ai-pdlc setup-codex --repo-root /absolute/path/to/your/repo
```

### Windows

1. Скачать новый release zip
2. Заменить содержимое старой распакованной директории
3. Снова выполнить setup:

```powershell
C:\Tools\ai-pdlc\bin\ai-pdlc.exe setup-codex --repo-root D:\path\to\your\repo
```

## Удаление

### macOS

```bash
ai-pdlc remove-codex
```

### Windows

```powershell
C:\Tools\ai-pdlc\bin\ai-pdlc.exe remove-codex
```

Проверить удаление:

```bash
codex mcp list --json
```
