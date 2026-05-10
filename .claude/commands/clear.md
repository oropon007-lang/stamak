---
description: Delete all generated sticker output directories
allowed-tools: Bash
---

Delete the generated output directory `stickers/` and the intermediate cache `tools/.cache/`.

```
cd ~/projects/stamak/tools && npm run clear
```

This is destructive but only affects generated outputs — source JPG/PNG sheets are untouched. Confirm what was deleted in your reply.
