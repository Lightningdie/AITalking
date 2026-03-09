---
name: feature-planning
description: Generate structured feature implementation plans with gap analysis, priority classification, and acceptance criteria. Use when analyzing project completeness, creating implementation roadmaps, defining feature specifications, or when the user asks to plan, audit, or prioritize features.
---

# 功能计划与定义流程

## 职责

分析项目设计文档与当前代码实现的差距，生成结构化的功能实现计划，包含优先级分类、操作步骤和验收标准。

## 执行流程

### Phase 1：全量扫描

1. **读取设计文档**：读取 `designDoc/` 下所有 `.md` 文件，提取功能需求清单
2. **扫描代码实现**：遍历 `src/` 目录，逐文件分析已实现的功能点
3. **逐项比对**：将设计文档中的每个功能需求与代码实现一一对照

### Phase 2：缺口分析

按以下维度检查每个功能：

```
- 是否有对应的类型定义
- 是否有对应的逻辑实现（hooks / services / utils）
- 是否有对应的 UI 组件和交互
- 是否有对应的样式
- 是否有持久化（localStorage / 状态管理）
- 是否有错误处理
```

### Phase 3：分类与优先级

按功能类型分类：

| 类型 | 说明 |
|------|------|
| 安全 | XSS、注入、协议校验 |
| 存储 | localStorage、持久化、数据迁移 |
| UI/交互 | 组件、控件、响应式、动画 |
| 协议/架构 | API 层、适配器、类型定义 |
| 性能 | 虚拟化、memo、节流、内存 |
| 导出/工具 | 导出、统计、预览 |

按优先级排序：

| 优先级 | 标准 |
|--------|------|
| P0 | 安全漏洞、核心功能缺失、阻塞用户使用 |
| P1 | 设计文档明确要求、影响用户体验 |
| P2 | 体验优化、锦上添花、后续规划 |

### Phase 4：输出格式

每个功能项必须包含两种输出：

#### 操作（HOW）

```markdown
| # | 功能 | 修改文件 | 操作描述 |
|---|------|---------|---------|
| 1 | 功能名 | file1.tsx, file2.ts | 具体的代码修改步骤 |
```

#### 验收标准（WHAT）

```markdown
| # | 功能 | 验收标准 |
|---|------|---------|
| 1 | 功能名 | 用户可观察到的行为描述，如"输入 X 后看到 Y" |
```

## 输出模板

```markdown
## 功能缺口分析

### 按功能类型分类

| 类别 | 功能 | 优先级 | 设计文档依据 |
|------|------|--------|-------------|
| 安全 | XXX | P0 | §X.X |

---

### 实现计划

#### P0 - [类别名]

| # | 功能 | 操作 | 验收标准 |
|---|------|------|---------|
| 1 | 功能名 | 修改 file.tsx 中的 ... | 用户看到 ... |

#### P1 - [类别名]
...

#### P2 - [类别名]
...
```

## 注意事项

- 「后续规划」（如 Service Worker、Web Worker、国际化、语音）除非用户明确要求，否则标注为 P2 但不纳入本次实现
- 数据迁移：修改存储 key 名时必须提供向后兼容的迁移逻辑
- 每个功能的验收标准必须是用户可直接验证的行为，不能是「代码层面的描述」
- 修改 props 接口时，同步检查所有调用方是否需要更新
