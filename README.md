# PDXScript Formatter

Formats Paradox game script files (Stellaris, HOI4, EU4) in VS Code using [prettier-plugin-pdx-script](https://github.com/Myriad4Link/prettier-plugin-pdx-script).

## Features

- Format Paradox script files on save or with "Format Document"
- Supports four language IDs: `stellaris`, `hoi4`, `eu4`, `paradox`
- Consistent tab-based indentation and spacing around `=`
- Preserves comments

## Requirements

Install [CWTools for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=tboby.cwtools-vscode) — it provides the language definitions for Paradox game files. This extension depends on it and VS Code will install it automatically.

## Usage

Open any `.txt` file associated with a Paradox language ID (Stellaris, HOI4, EU4, or generic Paradox) and run **Format Document** (`Shift+Alt+F`).
