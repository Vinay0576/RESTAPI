export const meta={type:'object',properties:{requestId:{type:'string',format:'uuid'}},required:['requestId'],additionalProperties:false};
export const envelope=data=>({type:'object',properties:{data,meta},required:['data','meta'],additionalProperties:false});
export const errorSchema={type:'object',properties:{error:{type:'object',properties:{code:{type:'string'},message:{type:'string'},details:{}},required:['code','message']},requestId:{type:'string'}},required:['error','requestId']};
export const errors=Object.fromEntries([400,401,403,404,405,409,413,415,422,429,500,503].map(code=>[code,errorSchema]));
export const noQuery={type:'object',properties:{},additionalProperties:false};
export const listQuery={type:'object',properties:{limit:{type:'string',pattern:'^[0-9]{1,3}$'},offset:{type:'string',pattern:'^[0-9]{1,6}$'},
  sort:{type:'string',maxLength:200,description:'Comma-separated columns; prefix - for descending. Primary key breaks ties.'},
  filter:{type:'string',maxLength:4000,description:'JSON equality-filter object, e.g. {"state":"requested"}. Use string values for numeric/int8 fields.'},
  q:{type:'string',minLength:1,maxLength:200,description:'Literal case-insensitive substring across text fields.'},
  includeArchived:{type:'string',enum:['true','false']}},additionalProperties:false};

// Keep generated table routes and dedicated modules on the same HTTP contract.
export function resourceSchemas(resource) {
  return {
    base: {
      tags: [resource.domain],
      description: `${resource.purpose}\n\nRetention: ${resource.mode}. Privileged local data administration; source client permissions: ${resource.access}`,
      'x-resource': resource.name,
    },
    one: envelope(resource.responseSchema),
    list: {
      type: 'object',
      properties: {
        data: {type: 'array', items: resource.responseSchema},
        page: {
          type: 'object',
          properties: {limit: {type: 'integer'}, offset: {type: 'integer'}, total: {type: 'string'}, hasMore: {type: 'boolean'}},
          required: ['limit', 'offset', 'total', 'hasMore'],
        },
        meta,
      },
      required: ['data', 'page', 'meta'],
    },
  };
}
