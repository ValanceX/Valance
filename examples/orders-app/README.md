# orders-app: the second reference application

A master-detail screen over a backend: a list of orders filtered by status (the filter is the address), an order shown beside the list, and a change of status that the server may refuse. Written, like [`forms-app`](../forms-app), to find what building something takes, not to be a model of it. What it found is in [`docs/findings/2026-10-16-orders-app.md`](../../docs/findings/2026-10-16-orders-app.md).

- `/orders` is a route with a `load` (the list) and `children`; its screen draws the filter and the list and puts the child in its `<mesh-slot />`; `index` is what the slot shows before an order is picked.
- `/orders/:id` is its child, `delivery: "client"` (the build cannot list the ids), with a `load` for the order and a `canDeactivate` that stops leaving it with a status picked and not saved.
- The backend is not included: the tests answer `/api/orders` and `/api/orders/:id`, `GET` and `PATCH`.

```
$ pnpm --filter @valancex/orders-app test:smoke
```
