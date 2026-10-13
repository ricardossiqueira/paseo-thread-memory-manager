# Thread Memory Manager

A [Paseo](https://paseo.sh) plugin that prompts you to archive threads once they're done, lets
you bulk-archive them from a dedicated screen, and tracks how much worktree cache space archiving
would actually free.

## Install

```bash
paseo plugin install github:ricardossiqueira/paseo-thread-memory-manager
```

See [`OVERVIEW.md`](./OVERVIEW.md) for what the plugin does and how it works.

## Develop

```bash
npm install
npm run typecheck
paseo plugin install /path/to/this/checkout
paseo plugin reload thread-memory-manager
```
