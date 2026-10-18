// HTTP handling stays here; the shared service owns transactions, retention and audit writes.
export function createContractsController(service, resource) {
  return {
    async list(request) {
      return {...await service.list(resource, request.query), meta: {requestId: request.id}};
    },

    async get(request) {
      return {data: await service.get(resource, request.params), meta: {requestId: request.id}};
    },

    async create(request, reply) {
      const data = await service.write(resource, 'POST', undefined, request.body, request.id);
      reply.code(201).header('Location', `${resource.path}/${encodeURIComponent(data.id)}`);
      return {data, meta: {requestId: request.id}};
    },
  };
}
