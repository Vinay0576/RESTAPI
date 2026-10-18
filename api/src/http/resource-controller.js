// Module controllers reuse these handlers; services retain transaction and audit ownership.
export function createModuleController(domain, resources, service) {
  return Object.fromEntries(resources.filter(resource => resource.domain === domain).map(resource => [
    resource.name.split('.')[1],
    {
      async list(request) {
        return {...await service.list(resource, request.query), meta: {requestId: request.id}};
      },
      async get(request) {
        return {data: await service.get(resource, request.params), meta: {requestId: request.id}};
      },
      async create(request, reply) {
        const data = await service.write(resource, 'POST', undefined, request.body, request.id);
        reply.code(201).header('Location', resource.path + '/' + resource.pk.map(key => encodeURIComponent(data[key])).join('/'));
        return {data, meta: {requestId: request.id}};
      },
      async update(request) {
        return {data: await service.write(resource, 'PATCH', request.params, request.body, request.id), meta: {requestId: request.id}};
      },
      async archive(request, reply) {
        await service.write(resource, 'DELETE', request.params, undefined, request.id);
        reply.code(204).send();
      },
    },
  ]));
}
