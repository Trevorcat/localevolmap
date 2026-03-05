# Example Gene - 错误修复基因

这是一个示例基因文件，展示如何定义一个用于自动修复错误的基因。

```json
{
  "type": "Gene",
  "id": "gene_repair_type_errors",
  "category": "repair",
  "signals_match": [
    "type error",
    "undefined",
    "null",
    "not a function",
    "TypeError",
    "类型错误",
    "类型不匹配"
  ],
  "preconditions": [
    "signals contains type-related error indicators"
  ],
  "strategy": [
    "Extract error location from stack trace",
    "Analyze type mismatch pattern",
    "Check for missing type declarations",
    "Apply type guard or assertion",
    "Validate using TypeScript compiler",
    "Record evolution event"
  ],
  "constraints": {
    "max_files": 5,
    "max_lines": 50,
    "forbidden_paths": [
      ".git",
      "node_modules",
      "dist"
    ],
    "timeout_ms": 30000
  },
  "validation": [
    "tsc --noEmit",
    "npm test -- --grep type"
  ],
  "metadata": {
    "author": "local-evomap",
    "version": "1.0.0",
    "description": "Automatically repair TypeScript type errors",
    "tags": [
      "typescript",
      "type-error",
      "auto-repair"
    ]
  }
}
```

## 使用方法

1. 将此 JSON 保存到 `data/genes/gene_repair_type_errors.json`
2. 或者使用代码加载：

```typescript
import { LocalEvomap } from './index';
import type { Gene } from './types/gene-capsule-schema';

const evomap = new LocalEvomap();
await evomap.init();

const gene: Gene = { /* ... */ };
await evomap.addGene(gene);
```

## 基因设计原则

1. **信号匹配**：使用多语言别名，如 `"error|错误 | エラー"`
2. **策略描述**：清晰、可执行的步骤
3. **约束明确**：限制影响范围，防止失控
4. **验证可靠**：使用自动化验证命令
