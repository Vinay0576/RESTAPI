"""Build a source-traced design draft; does not implement or call any API."""
from pathlib import Path
from copy import deepcopy
import json
import re
import hashlib
import build_assessment as assessment

OUT = Path(__file__).parent
ROOT = assessment.ROOT
SCHEMAS = {}
PATHS = {}
UUID = {'type': 'string', 'format': 'uuid'}
DATE = {'type': 'string', 'format': 'date'}
INSTANT = {'type': 'string', 'format': 'date-time'}
TEXT = {'type': 'string'}
BOOL = {'type': 'boolean'}
AUDIENCE = {'type': 'string', 'enum': ['customer', 'owner', 'operator']}

def obj(properties, required=None, **extra):
    return dict(type='object', properties=properties,
                required=list(properties) if required is None else required,
                additionalProperties=False, **extra)

def ref(name): return {'$ref': '#/components/schemas/' + name}
def nullable(schema):
    result = deepcopy(schema)
    result['type'] = [result['type'], 'null']
    return result
def array(items, **kwargs): return dict(type='array', items=items, **kwargs)
def integer(low, high=None, **kwargs):
    return dict(type='integer', minimum=low, **({'maximum': high} if high is not None else {}), **kwargs)
def string(low=1, high=200, **kwargs): return dict(type='string', minLength=low, maxLength=high, **kwargs)
def param(name, schema, required=False, description='', location='query', **kwargs):
    return dict(name=name, **{'in': location}, required=required, schema=schema, description=description, **kwargs)
def evidence(path, anchor):
    lines=(ROOT/path).read_text().splitlines()
    matches=[i+1 for i,l in enumerate(lines) if anchor in l]
    assert matches, (path,anchor)
    return {'file':path,'line':matches[0],'symbol':anchor}

SCHEMAS['Meta'] = obj({'requestId':string(1,128)})
SCHEMAS['Error'] = obj({'error':obj({'code':string(1,80),'message':string(1,500),
    'details':array(obj({'field':string(1,150),'reason':string(1,200)}), maxItems=50)}, ['code','message']),
    'requestId':string(1,128)})
SCHEMAS['Page'] = obj({'limit':integer(1,100),'nextCursor':nullable(string(1,2048))})

def envelope(name): return obj({'data':ref(name),'meta':ref('Meta')})
def response(name, description='Success'):
    return {'description':description,'content':{'application/json':{'schema':envelope(name)}}}
def empty(description): return {'description':description}
def add(method,path,operation_id,summary,domain,auth,source,responses,parameters=None,body=None,
        rules=None,changes=None,errors=None,description=''):
    common={'400':'Malformed request, duplicate scalar query parameter or invalid cursor encoding',
            '422':'Well-formed request fails schema or business validation',
            '429':'Rate limit exceeded; obey Retry-After',
            '500':'Unexpected error; no SQL or secret details exposed',
            '503':'Required backend unavailable; never report an empty successful result'}
    if auth: common.update({'401':'Missing, invalid, expired or replaced session','403':'Account/app admission or action denied'})
    if body: common.update({'413':'Body exceeds configured limit','415':'Content-Type must be application/json'})
    common.update(errors or {})
    result=deepcopy(responses)
    for code,desc in common.items():
        result[code]={'description':desc,'content':{'application/json':{'schema':ref('Error')}}}
        if code=='429': result[code]['headers']={'Retry-After':{'description':'Seconds until retry permitted','schema':integer(1)}}
    operation={'operationId':operation_id,'summary':summary,'tags':[domain],
               'description':description or summary,'security':[{'bearerAuth':[]}] if auth else [],
               'responses':result,'x-contract-status':'draft-source-reviewed-not-implemented',
               'x-authorization-policy':auth or 'Public safe projection; never enrich based on an unverified bearer header.',
               'x-source-evidence':source,'x-business-rules':rules or [],
               'x-proposed-changes-requiring-confirmation':changes or []}
    if parameters: operation['parameters']=parameters
    if body: operation['requestBody']={'required':True,'content':{'application/json':{'schema':ref(body)}}}
    PATHS.setdefault('/v1'+path,{})[method.lower()]=operation

OWN='Verified admitted account and active device session; selected account UUID from trusted token/session mapping; only its own rows. Same-phone individual/company accounts remain isolated.'
CUSTOMER=OWN+' Customer admission required, not a caller-supplied role or customerId.'
id_param=param('id',UUID,True,'Resource UUID; ownership is checked separately.','path')
cursor_param=param('cursor',string(1,2048),description='Proposed opaque signed cursor, bound to actor, endpoint and filters. Decode to created_at/id; reject tampering or filter changes with 422 INVALID_CURSOR. Not a frozen database snapshot.')
address_source=[evidence('services/addressService.ts','export function savedAddressKey'),
                evidence('supabase/migrations/20260722170100_create_saved_addresses.sql','create table if not exists public.saved_addresses')]
address_changes=['Proposed limits: label 1..80 and address 1..1000 characters after trimming; reject whitespace-only text.',
    'Current DB allows independently null coordinates. New writes require both coordinates or neither; clearing requires both null. Audit legacy rows before enforcing DB constraints.',
    'Current deduplication is client-side read-before-write. Atomic normalized uniqueness and collision handling require a migration and duplicate cleanup; preserve most recent record under existing client rule.',
    'Use a compound unique key (account, normalized label, normalized address), not the client delimiter-concatenated string; agree Unicode/case/whitespace normalization parity.',
    'API uses UUIDs only. Device-local local_* addresses require explicit client import through POST and local-ID remapping; never silently discard them.']
coord_props={'lat':nullable({'type':'number','minimum':-90,'maximum':90}),
             'lng':nullable({'type':'number','minimum':-180,'maximum':180})}
coord_rules={'dependentRequired':{'lat':['lng'],'lng':['lat']},
    'allOf':[{'if':{'properties':{'lat':{'type':'null'}},'required':['lat']},
              'then':{'properties':{'lng':{'type':'null'}}}},
             {'if':{'properties':{'lng':{'type':'null'}},'required':['lng']},
              'then':{'properties':{'lat':{'type':'null'}}}}]}
address_input={'label':string(1,80,pattern=r'\S'),'address':string(1,1000,pattern=r'\S'),**coord_props}
SCHEMAS['AddressCreate']=obj(address_input,['label','address'],**coord_rules)
SCHEMAS['AddressPatch']=obj(address_input,[],minProperties=1,**coord_rules)
# Response permits legacy independent nulls and unrestricted legacy text lengths.
SCHEMAS['Address']=obj({'id':UUID,'label':TEXT,'address':TEXT,**coord_props,'createdAt':INSTANT})
SCHEMAS['AddressPage']=obj({'data':array(ref('Address')),'page':ref('Page'),'meta':ref('Meta')})
add('GET','/me/addresses','listSavedAddresses','List own saved addresses','Saved addresses',OWN,address_source,
    {'200':{'description':'Newest first; stable created_at DESC, id DESC','content':{'application/json':{'schema':ref('AddressPage')}}}},
    [param('limit',integer(1,100,default=25)),cursor_param],
    rules=['Ownership always comes from trusted actor context, never userId query.',
           'Deduplicate legacy rows before pagination so one address does not appear on multiple pages.'],
    changes=address_changes+['Cursor pagination and default 25/cap100 are new; existing client loads all rows.'])
add('POST','/me/addresses','saveAddress','Create or reuse saved address','Saved addresses',OWN,address_source,
    {'201':response('Address','Created'), '200':response('Address','Existing normalized duplicate; preserve stored coordinates and identity')},
    body='AddressCreate',rules=['Owner assigned server-side. Existing normalized duplicate does not silently update coordinates.'],changes=address_changes)
add('PATCH','/me/addresses/{id}','updateAddress','Edit own saved address','Saved addresses',OWN,address_source,
    {'200':response('Address')},[id_param],body='AddressPatch',
    rules=['Omitted fields unchanged; null allowed only for lat/lng, both supplied together.',
           'Current service sends a full input. Nonempty partial PATCH is proposed; merge then validate; duplicate normalized key returns 409.'],
    changes=address_changes,errors={'404':'ADDRESS_NOT_FOUND; missing and foreign IDs indistinguishable','409':'DUPLICATE_ADDRESS'})
add('DELETE','/me/addresses/{id}','deleteAddress','Delete own saved address','Saved addresses',OWN,address_source,
    {'204':empty('Deleted or already absent; foreign IDs also return 204 without modifying a row.')},[id_param],
    rules=['Deletion constrained by both id and trusted account ID; do not acknowledge database failure as success.'])

search_source=[evidence('services/marketplaceService.ts','export async function'),
               evidence('supabase/migrations/20261005102237_customer_guest_catalogue.sql','create or replace function public.search_guest_machines')]
public_fields={key:nullable(TEXT) for key in ['ref_code','type','type_label','make','model','capacity','status','image_uri','city']}
public_fields.update({key:nullable({'type':'number'}) for key in ['rate_daily','rate_hourly','rate_monthly','weekly_discount_pct','monthly_discount_pct','operator_rate','machine_rating','operator_rating','distance_km']})
public_fields.update({'id':UUID,'year':nullable({'type':'integer'}),'review_count':nullable({'type':'integer'}),
    'operator_included':nullable(BOOL),'operator_available_on_request':nullable(BOOL),
    'operator_rate_basis':{'type':['string','null'],'enum':['hourly','trip',None]},'kyc_verified':{'const':True,'type':'boolean'},
    'image_uris':nullable(array(TEXT)),'feature_codes':nullable(array(TEXT))})
SCHEMAS['MachinePublic']=obj(public_fields,description='Exact guest RPC field allowlist, retaining snake_case. Nullable fields accommodate historical rows; reconcile hosted types/nullability before freezing. Listing rate numerics are legacy INR rupees, not paise, and are display values only; no financial arithmetic in floating point. No owner, phone, yard coordinates or document fields.')
SCHEMAS['MachineSearch']=obj({'items':array(ref('MachinePublic'),maxItems=60),'total':integer(0),'limit':integer(1,60),'offset':integer(0,100000)})
SCHEMAS['Bounds']=obj({k:{'type':'number','minimum':-90 if k in ['south','north'] else -180,'maximum':90 if k in ['south','north'] else 180} for k in ['south','north','west','east']})
query=[param('query',string(0,200)),param('city',string(1,120)),
    param('types',array(string(1,80),minItems=1,maxItems=50,uniqueItems=True),style='form',explode=True,description='Repeat types=X&types=Y; active equipment codes, not labels. Proposed cap 50.'),
    param('lat',{'type':'number','minimum':-90,'maximum':90}),param('lng',{'type':'number','minimum':-180,'maximum':180}),
    param('bounds',ref('Bounds'),style='deepObject',explode=True,description='bounds[south], bounds[north], bounds[west], bounds[east]; all four required. west>east crosses antimeridian; south<=north.'),
    param('startDate',DATE),param('endDate',DATE),param('startMinute',integer(0,1439)),param('durationMinutes',integer(1,720)),
    param('minRating',{'type':'number','minimum':0,'maximum':5}),param('withOperator',BOOL),
    param('sort',{'type':'string','enum':['nearest','price_asc','price_desc','best_rated','most_rated','newest'],'default':'nearest'}),
    param('limit',integer(1,60,default=24)),param('offset',integer(0,100000,default=0))]
search_rules=['Map to search_guest_machines. Use a fixed parameterized RPC adapter and response allowlist. Never fetchMachine or SELECT *.',
    'lat and lng supplied together; search coordinates are caller site coordinates, never return precise yard location.',
    'startDate/endDate supplied together. Start today..today+29 in Asia/Kolkata; end>=start and end-start<=89 days.',
    'startMinute/durationMinutes together and only with a single-day range; sum<=1440. Cross-field and relative-date checks are service validation, not enforced by independent query schemas.',
    'Bounds all four fields, south<=north; support antimeridian crossing west>east.',
    'Server determines publication/KYC/moderation/operator eligibility and service-radius availability. total is exact before limit/offset, ID is stable sort tie-breaker.',
    'withOperator omitted means no operator filter; false excludes mandatory operator-included listings. nearest without coordinates follows existing null-distance/rating/ID ordering.',
    'This public route always uses guest-safe projection, including authenticated callers. Audit authenticated client reliance on search_machines_filtered before replacing it.']
search_changes=['String lengths, types array cap, strict booleans/unknown query rejection and bounds validation are proposed HTTP hardening.',
    'Preserve snake_case guest fields and decimal-rupee listing rate values for compatibility; charged payment DTOs separately use explicit integer minor units. Confirm currency/casing migration with clients.',
    'Public detail route intentionally never switches to private owner projection. Owners use existing owner fleet route.']
add('GET','/machines','searchMachines','Search publicly visible equipment','Public catalogue',None,search_source,
    {'200':response('MachineSearch')},query,rules=search_rules,changes=search_changes,
    errors={'422':'INVALID_WINDOW, INVALID_COORDINATES, INVALID_BOUNDS, INVALID_FILTER or INVALID_PAGE'})
add('GET','/machines/{id}','getPublicMachine','Read public equipment details','Public catalogue',None,search_source,
    {'200':response('MachinePublic')},[id_param],rules=['Call search_guest_machines with p_machine_id=id; no schedule filter; empty result maps to 404. All guest visibility gates still apply.'],
    changes=search_changes,errors={'404':'MACHINE_NOT_VISIBLE; missing and hidden listings indistinguishable'})

hold_source=[evidence('supabase/migrations/20261004205037_checkout_availability_hold.sql','create or replace function private.acquire_checkout_hold'),
             evidence('supabase/migrations/20261004205037_checkout_availability_hold.sql','create or replace function private.send_booking_request')]
SCHEMAS['HoldInput']=obj({'machineId':UUID,'startDate':DATE,'endDate':DATE,
    'startMinute':integer(360,1080),'durationMinutes':integer(60,720)},['machineId','startDate','endDate'],
    dependentRequired={'startMinute':['durationMinutes'],'durationMinutes':['startMinute']})
SCHEMAS['Hold']=obj({'id':UUID,'expiresAt':INSTANT})
hold_rules=['Actor resolved from selected admitted customer account. At most one hold per customer; another machine/window replaces previous hold atomically.',
    'Acquire under current database advisory locks/exclusion checks; same live machine/window returns same ID and original expiry, not a sliding renewal. New hold lasts five minutes.',
    'HTTP 200 for acquire-or-reuse: existing RPC does not return a created flag. Map expires_at to expiresAt; server clock is authoritative.',
    'No Idempotency-Key requirement for this operation: current actor/window semantics provide retry behavior while hold lives. After expiry, a retry can acquire a new hold subject to current availability.',
    'Missing/expired hold during subsequent booking submission is recoverable with atomic availability recheck. Live hold with wrong actor/machine/window is HOLD_MISMATCH, not a general HOLD_EXPIRED failure.',
    'Validate date order, booking horizon and single-day timed window; startMinute+durationMinutes<=1440. Availability response before hold is advisory.']
hold_changes=['Proposed adapter restricts ordinary holds to the customer booking window: start today..today+29, end-start<=89, start minute360..1080 and duration60..720. Hold SQL helper itself permits a broader window. Confirm any priority/negotiated flow needing different windows before adopting these limits.',
    'Cross-field/relative-date rules and today future-time rule must be implemented in service validation using Asia/Kolkata. No fixed date baked into schemas.',
    'Final identity provider and app/device admission adapter remain unresolved; bearer scheme describes transport only.']
add('POST','/checkout-holds','acquireCheckoutHold','Acquire or reuse checkout hold','Checkout holds',CUSTOMER,hold_source,
    {'200':response('Hold')},body='HoldInput',rules=hold_rules,changes=hold_changes,
    errors={'409':'MACHINE_UNAVAILABLE; includes current reservation/publication conflicts','422':'INVALID_WINDOW'})
add('DELETE','/checkout-holds/{id}','releaseCheckoutHold','Release own checkout hold','Checkout holds',CUSTOMER,
    [evidence('supabase/migrations/20261004205037_checkout_availability_hold.sql','create or replace function private.release_checkout_hold')],
    {'204':empty('Released, already expired, missing or foreign ID; never delete another customer hold.')},[id_param])

notification_source=[evidence('services/notificationService.ts','export async function fetchNotifications'),
    evidence('supabase/migrations/20260919132002_notification_inbox.sql','create or replace function public.get_my_notifications')]
notification_props={'id':UUID,'audience':AUDIENCE,'kind':string(1,100),'entityId':UUID,'sourceId':UUID,
    'machineLabel':nullable(TEXT),'status':nullable(TEXT),'createdAt':INSTANT,'readAt':nullable(INSTANT)}
notification_props['kind']['description']='Extensible string; known current values documented in services/notificationService.ts. Unknown future kind must not trigger arbitrary navigation or unsafe reads.'
SCHEMAS['Notification']=obj(notification_props)
SCHEMAS['NotificationPage']=obj({'data':array(ref('Notification'),maxItems=100),'page':ref('Page'),
    'meta':obj({'requestId':string(1,128),'asOf':INSTANT})})
SCHEMAS['NotificationCounts']=obj({'byAudience':obj({k:integer(0) for k in AUDIENCE['enum']},[])})
SCHEMAS['NotificationRead']=obj({'read':BOOL})
SCHEMAS['NotificationBulkRead']={'oneOf':[
    obj({'scope':{'type':'string','const':'all'},'audience':AUDIENCE,'before':INSTANT}),
    obj({'scope':{'type':'string','const':'support'},'messageIds':array(UUID,minItems=1,maxItems=100,uniqueItems=True)})]}
SCHEMAS['NotificationTarget']=obj({'status':nullable(TEXT),'assignmentState':nullable(TEXT),'returnPending':BOOL},['status','assignmentState'])
notification_changes=['Audience must be permitted for current admitted account/app; do not infer permission from requested audience. This strengthens recipient-only SQL with an explicit API admission policy; confirm multi-persona owner-self-operator behavior.',
    'Map snake_case SQL keys to documented camelCase DTO; do not expose recipient_id or event_key.',
    'Opaque actor/filter-bound cursors, strict input validation and cap100 for support-message batches are proposed adapter controls.']
add('GET','/me/notifications','listNotifications','Read own durable inbox','Notifications',OWN+' Audience admission required.',notification_source,
    {'200':{'description':'Recipient-owned inbox, created_at DESC/id DESC','content':{'application/json':{'schema':ref('NotificationPage')}}}},
    [param('audience',AUDIENCE,True),param('unread',dict(BOOL,default=False)),param('limit',integer(1,100,default=40)),cursor_param],
    rules=['Map unread to p_unread_only; false means all, not only read messages. No category filter exists in current RPC.',
    'Decode cursor to p_before_at/p_before_id. When returned count equals requested limit, nextCursor may be non-null even if the next page is empty; otherwise null. No total count promised.',
    'meta.asOf maps to statement-time as_of and is a bulk-read cutoff. Pagination is not snapshot isolation: newly inserted rows can appear on refresh and concurrent read-state changes can alter unread results.',
    'Operator DTO remains money-free; never join unrestricted booking rows to populate it.'],changes=notification_changes,
    errors={'403':'AUDIENCE_DENIED','422':'INVALID_CURSOR or invalid audience/filter'})
add('GET','/me/notification-counts','getNotificationCounts','Read unread counts','Notifications',OWN,
    [evidence('supabase/migrations/20260919132002_notification_inbox.sql','create or replace function public.get_my_notification_counts')],
    {'200':response('NotificationCounts')},rules=['Counts are unread only. Emit permitted audiences returned by RPC; absent permitted audience means zero, not access granted. Unpermitted audiences omitted. No total or unread=false selector.'],changes=notification_changes)
add('PATCH','/me/notifications/{id}','setNotificationRead','Set own notification read flag','Notifications',OWN,
    [evidence('supabase/migrations/20260919132002_notification_inbox.sql','create or replace function private.set_notification_read')],
    {'204':empty('RPC true -> 204; no Notification payload returned.')},[id_param],body='NotificationRead',
    rules=['RPC false -> 404; unknown and foreign IDs indistinguishable. Repeated true may change read_at under existing SQL; only read/unread state is idempotent.'],
    errors={'404':'NOTIFICATION_NOT_FOUND'})
add('POST','/me/notifications/read','markNotificationsRead','Mark inbox cutoff or support replies read','Notifications',OWN,
    [evidence('supabase/migrations/20260919132002_notification_inbox.sql','create or replace function private.mark_all_notifications_read'),
     evidence('supabase/migrations/20260919132002_notification_inbox.sql','create or replace function private.mark_support_notifications_read')],
    {'204':empty('Void RPC result; no updatedCount. No matching own rows is also 204.')},body='NotificationBulkRead',
    rules=['scope=all: require authorized audience and before cutoff, normally latest inbox meta.asOf. SQL clamps cutoff to server statement time.',
           'scope=support: messageIds are support message UUIDs, not notification or ticket IDs. Update only own support_reply rows with source_id in list; foreign/missing IDs ignored without revealing existence.',
           'Reject fields from other branch; all and support shapes are mutually exclusive.'],changes=notification_changes,
    errors={'403':'AUDIENCE_DENIED for scope=all','422':'INVALID_SCOPE or invalid cutoff/message IDs'})
add('GET','/me/notifications/{id}/target','getNotificationTarget','Read current navigation context','Notifications',OWN,
    [evidence('supabase/migrations/20260920090853_cancelled_booking_yard_return.sql','create or replace function private.get_notification_target')],
    {'200':response('NotificationTarget')},[id_param],
    rules=['Map RPC null to 404. Support target returns null status and assignmentState, with returnPending absent.',
           'For supported booking targets, return safe status/assignment state and optional cancellation-return flag; never return the booking finance row.',
           'Use already-owned inbox kind/entityId to choose a route. Context does not itself grant access to target resource; destination endpoint reauthorizes. Do not synthesize a URL or promise all notification kinds resolve.'],
    errors={'404':'TARGET_UNAVAILABLE; inaccessible, absent or unsupported target indistinguishable'})

spec={'openapi':'3.1.1','jsonSchemaDialect':'https://json-schema.org/draft/2020-12/schema',
      'info':{'title':'EquipRent REST API — reviewed contract subset','version':'0.2.0-draft',
              'description':'Design proposal for 13 operations, not a deployed API or full contract for all 266 catalogue entries. Evidence: source commit '+assessment.__dict__.get('SOURCE_COMMIT','70766035a1ecbd5b30ac5ca4acaf6b0323431cf0')+'. Business rules and proposed deltas are explicit x-extensions; these are not automatically enforced by schema validators. No authentication issuance or staff permission model is frozen here.'},
      'servers':[{'url':'/','description':'Relative placeholder; paths already include /v1. No deployed server asserted.'}],
      'tags':[{'name':x} for x in ['Saved addresses','Public catalogue','Checkout holds','Notifications']],
      'paths':PATHS,'components':{'securitySchemes':{'bearerAuth':{'type':'http','scheme':'bearer',
           'description':'Opaque transport contract; identity provider not selected. Server verifies token and selected-account/app/device admission. Never accept self-declared roles. No token issuance specified.'}},'schemas':SCHEMAS},
      'x-source-root':str(ROOT),'x-source-commit':'70766035a1ecbd5b30ac5ca4acaf6b0323431cf0',
      'x-contract-conventions':{'unknownFields':'Reject unknown body and query fields; OpenAPI parameters do not enforce unknown-query rejection automatically.',
          'queryParsing':'Strict true/false booleans, finite numbers and decimal integers. No null query values. Reject repeated scalar parameters; arrays use documented repetition. Decode bounds via explicit safe parser, never arbitrary object merging.',
          'privateCaching':'Cache-Control: no-store for protected successes and errors. Public caching only after privacy-aware key and freshness policy are chosen; availability never guaranteed by cache.',
          'requestCorrelation':'Server generates meta.requestId/error.requestId and X-Request-Id; sanitize incoming correlation values.',
          'errorMapping':'Error status/code names are proposed HTTP translations, not current Postgres error names. Map recognized cases centrally; unknown SQL errors stay sanitized 500.',
          'compatibility':'New /v1 adapter and client rollout required. Existing Supabase RPCs/clients are not automatically wire-compatible.'}}

# Illustrative wire examples, with no real identity, device credential or token.
ID='00000000-0000-4000-8000-000000000001'
OTHER='00000000-0000-4000-8000-000000000002'
NOW='2026-10-18T06:00:00Z'
address_example={'id':ID,'label':'Warehouse','address':'Example site, Hyderabad','lat':17.44,'lng':78.35,'createdAt':NOW}
notification_example={'id':ID,'audience':'customer','kind':'booking_status','entityId':OTHER,'sourceId':OTHER,
                      'machineLabel':'Excavator','status':'Confirmed','createdAt':NOW,'readAt':None}
machine_example={key:None for key in public_fields}
machine_example.update({'id':ID,'ref_code':'EQ-EXAMPLE','type':'example-type','type_label':'Excavator',
    'make':'Example','model':'Example model','year':2024,'capacity':'Example capacity',
    'rate_daily':5000,'operator_included':False,'operator_available_on_request':True,
    'operator_rate_basis':'hourly','operator_rate':200,'review_count':0,
    'kyc_verified':True,'status':'Live','city':'Hyderabad','image_uris':[],'feature_codes':[]})
body_examples={
    'saveAddress':{'newAddress':{'value':{'label':'Warehouse','address':'Example site, Hyderabad','lat':17.44,'lng':78.35}}},
    'updateAddress':{'rename':{'value':{'label':'Main warehouse'}},'clearCoordinates':{'value':{'lat':None,'lng':None}}},
    'acquireCheckoutHold':{'ordinaryHourlyHold':{'description':'Illustrative date; evaluate relative-date and future-time rules using the actual server clock.','value':{'machineId':ID,'startDate':'2026-10-19','endDate':'2026-10-19','startMinute':600,'durationMinutes':120}}},
    'setNotificationRead':{'read':{'value':{'read':True}},'unread':{'value':{'read':False}}},
    'markNotificationsRead':{'inboxCutoff':{'value':{'scope':'all','audience':'customer','before':NOW}},
                             'supportMessages':{'value':{'scope':'support','messageIds':[OTHER]}}}}
def wrapped(data): return {'data':data,'meta':{'requestId':'example-request-001'}}
success_examples={
    'listSavedAddresses':{'data':[address_example],'page':{'limit':25,'nextCursor':None},'meta':{'requestId':'example-request-001'}},
    'saveAddress':wrapped(address_example),'updateAddress':wrapped(address_example),
    'searchMachines':wrapped({'items':[machine_example],'total':1,'limit':24,'offset':0}),
    'getPublicMachine':wrapped(machine_example),
    'acquireCheckoutHold':wrapped({'id':ID,'expiresAt':'2026-10-18T06:05:00Z'}),
    'listNotifications':{'data':[notification_example],'page':{'limit':40,'nextCursor':None},'meta':{'requestId':'example-request-001','asOf':NOW}},
    'getNotificationCounts':wrapped({'byAudience':{'customer':1}}),
    'getNotificationTarget':wrapped({'status':'Confirmed','assignmentState':None,'returnPending':False})}
for methods in PATHS.values():
    for op in methods.values():
        operation_id=op['operationId']
        if operation_id in body_examples:
            op['requestBody']['content']['application/json']['examples']=body_examples[operation_id]
        for code,res in op['responses'].items():
            media=res.get('content',{}).get('application/json')
            if not media: continue
            if code.startswith('2'):
                media['example']=success_examples[operation_id]
            else:
                media['example']={'error':{'code':{'400':'INVALID_REQUEST','401':'UNAUTHENTICATED',
                    '403':'FORBIDDEN','404':'NOT_FOUND','409':'CONFLICT','413':'PAYLOAD_TOO_LARGE',
                    '415':'UNSUPPORTED_MEDIA_TYPE','422':'VALIDATION_FAILED','429':'RATE_LIMITED',
                    '500':'INTERNAL_ERROR','503':'SERVICE_UNAVAILABLE'}[code],
                    'message':'Illustrative sanitized error; use the operation-specific code where documented.'},
                    'requestId':'example-request-001'}

CASES=[]
def case(identifier,method,path,setup,request,expected,layer='integration',basis='Existing capability, proposed HTTP mapping'):
    CASES.append({'id':identifier,'method':method,'path':'/v1'+path,'setup':setup,'request':request,
                  'expected':expected,'verification_layer':layer,'basis':basis,'execution_status':'not_run'})
case('ADDR-01','POST','/me/addresses','Admitted account, no normalized duplicate.',
     {'body':{'label':'Warehouse','address':'Example site, Hyderabad'}},
     {'status':201,'assertions':['Owner comes from session, UUID returned, coordinates nullable.']})
case('ADDR-02','POST','/me/addresses','Same account has Warehouse / Example site, Hyderabad.',
     {'body':{'label':' WAREHOUSE ','address':'Example  site, Hyderabad','lat':17.44,'lng':78.35}},
     {'status':200,'assertions':['Same existing UUID and stored coordinates; no second row.','Two concurrent creates result in one canonical row.']},
     basis='Client duplicate intent exists; atomic DB uniqueness is proposed and requires migration.')
case('ADDR-03','PATCH','/me/addresses/{id}','Own stored address.',{'path':{'id':ID},'body':{}},
     {'status':422,'assertions':['No row changed.']},'schema',basis='Proposed nonempty PATCH validation.')
case('ADDR-04','PATCH','/me/addresses/{id}','Own stored address.',{'path':{'id':ID},'body':{'lat':None,'lng':None}},
     {'status':200,'assertions':['Both coordinates cleared; text unchanged.']},basis='Proposed partial update and explicit clearing semantics.')
case('ADDR-05','POST','/me/addresses','Authenticated account.',{'body':{'label':'Site','address':'Example','lat':17.44}},
     {'status':422,'assertions':['Coordinate pair required; no write.']},'schema',basis='New stricter safeguard, not current table constraint.')
case('ADDR-06','PATCH','/me/addresses/{id}','Address belongs to another account with the same verified phone.',
     {'path':{'id':OTHER},'body':{'label':'Changed'}},
     {'status':404,'assertions':['No data disclosure or cross-account update.']})
case('ADDR-07','DELETE','/me/addresses/{id}','ID belongs to a different account.',{'path':{'id':OTHER}},
     {'status':204,'assertions':['Foreign row remains unchanged.']})
case('ADDR-08','GET','/me/addresses','Saved address table is unavailable; client previously used local fallback.',{},
     {'status':503,'assertions':['No successful empty-list response or fabricated local UUID.','Client import/remapping is a separate migration step.']},basis='Proposed fail-closed adapter behavior; no server-side AsyncStorage fallback.')
case('SEARCH-01','GET','/machines','Public eligible catalogue contains more than 60 matches.',{'query':{'limit':61}},
     {'status':422,'assertions':['Do not silently clamp or bypass current guest RPC cap.']},'schema')
case('SEARCH-02','GET','/machines','Any guest.',{'query':{'lat':17.44}},
     {'status':422,'assertions':['Require longitude too.']},'service validation')
case('SEARCH-03','GET','/machines','Any guest.',{'query':{'bounds':{'south':-10,'north':10,'west':170,'east':-170}}},
     {'status':200,'assertions':['Cross-antimeridian bounds accepted; empty items is valid.']},'service validation')
case('SEARCH-04','GET','/machines','Eligible listing present.',{'query':{'sort':'newest','withOperator':False,'limit':24}},
     {'status':200,'assertions':['Exact total, stable ID tie-breaker.','No owner_id, owner_name, phone, precise yard coordinates or private document keys.','Rates retain documented INR rupee units.']})
case('SEARCH-05','GET','/machines/{id}','Caller owns a hidden/non-public machine.',{'path':{'id':ID}},
     {'status':404,'assertions':['Public route does not switch to an owner projection.','Owner fleet route is used for private listing management.']},basis='Recommended consistent public projection; verify authenticated client migration.')
case('SEARCH-06','GET','/machines','Server date fixed to 2026-10-18 Asia/Kolkata.',
     {'query':{'startDate':'2026-11-17','endDate':'2026-11-17'}},
     {'status':422,'assertions':['Today+30 is outside allowed today..today+29 start horizon.']},'service validation')
case('HOLD-01','POST','/checkout-holds','Same customer has a live hold for exactly this window; fixed server clock.',
     {'body':{'machineId':ID,'startDate':'2026-10-19','endDate':'2026-10-19','startMinute':600,'durationMinutes':120}},
     {'status':200,'assertions':['Same hold UUID and unchanged expiry; no renewal.']})
case('HOLD-02','POST','/checkout-holds','Two admitted customers concurrently acquire the same available window.',
     {'body':{'machineId':ID,'startDate':'2026-10-19','endDate':'2026-10-19','startMinute':600,'durationMinutes':120}},
     {'statuses':[200,409],'assertions':['Exactly one conflicting reservation wins; constraints remain enabled.']})
case('HOLD-03','DELETE','/checkout-holds/{id}','Hold belongs to another customer.',{'path':{'id':OTHER}},
     {'status':204,'assertions':['Other customer hold is unchanged.']})
case('BOOK-01','POST','/bookings','Full booking DTO valid, hold expired or absent, availability still free.',
     {'fixture':'Complete valid booking submission fixture must be supplied after BookingInput is finalized.'},
     {'status':201,'assertions':['Recheck and insert atomically; do not reject merely because hold expired.']},
     basis='Source-established rule; booking endpoint outside the 13-operation OpenAPI subset.')
case('BOOK-02','POST','/bookings','Full booking DTO references a live hold for a different schedule.',
     {'fixture':'Complete valid booking submission except live hold window mismatch.'},
     {'status':409,'errorCode':'HOLD_MISMATCH','assertions':['No booking or request receipt committed.']},
     basis='Source-established rule; booking endpoint outside the 13-operation OpenAPI subset.')
case('INBOX-01','GET','/me/notifications','Customer audience admitted.',{'query':{'audience':'customer','unread':False}},
     {'status':200,'assertions':['Read and unread entries included; default limit40.','asOf is statement time; nextCursor is not a frozen-snapshot guarantee.']})
case('INBOX-02','GET','/me/notifications','Signed cursor was issued for unread=true.',{'query':{'audience':'customer','unread':False,'cursor':'cursor-from-another-filter'}},
     {'status':422,'errorCode':'INVALID_CURSOR','assertions':['No cross-filter cursor reuse.']},'service validation',basis='Proposed actor/filter-bound cursor.')
case('INBOX-03','PATCH','/me/notifications/{id}','Own notification exists.',{'path':{'id':ID},'body':{'read':True}},
     {'status':204,'body':None,'assertions':['Empty body; RPC boolean not exposed as a Notification.']})
case('INBOX-04','PATCH','/me/notifications/{id}','Notification belongs to another account.',{'path':{'id':OTHER},'body':{'read':True}},
     {'status':404,'assertions':['Recipient scoping prevents mutation.']})
case('INBOX-05','POST','/me/notifications/read','Customer audience admitted.',
     {'body':{'scope':'all','audience':'customer','before':NOW,'messageIds':[ID]}},
     {'status':422,'assertions':['Mixed union branches rejected; no update.']},'schema')
case('INBOX-06','POST','/me/notifications/read','Some supplied support message IDs are foreign/missing.',
     {'body':{'scope':'support','messageIds':[ID,OTHER]}},
     {'status':204,'body':None,'assertions':['Only own support_reply source matches updated; no updatedCount or foreign existence signal.']})
case('INBOX-07','GET','/me/notifications/{id}/target','Own support reply points to an owned ticket.',{'path':{'id':ID}},
     {'status':200,'assertions':['data.status and data.assignmentState are null; returnPending may be absent.','No fabricated kind/targetId navigation payload.']})
case('AUTH-01','GET','/me/addresses','Old device session has been replaced.',{},
     {'status':401,'assertions':['Session binding enforced before data access.']},basis='Existing device isolation requirement; final auth adapter unresolved.')
case('AUTH-02','GET','/me/addresses','Session authority is temporarily unavailable, not known revoked.',{},
     {'status':503,'assertions':['Do not incorrectly revoke the device or return 401 merely for an outage.']},basis='Existing unavailable versus replaced distinction; proposed HTTP mapping.')

def write_acceptance_cases():
    payload={'title':'EquipRent draft contract acceptance cases','status':'Planned, not executed; no API implementation exists in this workspace.',
        'clock_note':'Relative-date scenarios use a fixed server date in Asia/Kolkata. Example UUIDs and data are fictitious.',
        'case_count':len(CASES),'cases':CASES}
    (OUT/'contract-acceptance-cases.json').write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n')

def verify_structure():
    """Bounded static checks only; not a replacement for an OpenAPI/schema validator."""
    catalogue={(e['method'],e['path']) for e in assessment.ENDPOINTS}
    operations=[]; refs=[]; checked_evidence=[]
    def visit(node):
        if isinstance(node,dict):
            if '$ref' in node:
                link=node['$ref']; assert link.startswith('#/'), link
                target=spec
                for part in link[2:].split('/'): target=target[part.replace('~1','/').replace('~0','~')]
                refs.append(link)
            for val in node.values(): visit(val)
        elif isinstance(node,list):
            for val in node: visit(val)
    visit(spec)
    for path,methods in PATHS.items():
        for method,op in methods.items():
            assert (method.upper(),path) in catalogue,(method,path)
            operations.append(op['operationId'])
            path_names=set(re.findall(r'\{([^}]+)\}',path))
            declared={p['name'] for p in op.get('parameters',[]) if p['in']=='path' and p['required']}
            assert path_names==declared,(path,declared)
            assert any(k.startswith('2') for k in op['responses'])
            assert '204' not in op['responses'] or 'content' not in op['responses']['204']
            assert method!='get' or 'requestBody' not in op
            assert op['security']==[] if path.startswith('/v1/machines') else bool(op['security'])
            for ev in op['x-source-evidence']:
                assert ev['symbol'] in (ROOT/ev['file']).read_text().splitlines()[ev['line']-1]
                checked_evidence.append(ev)
    assert len(operations)==13 and len(operations)==len(set(operations))
    assert len({c['id'] for c in CASES})==len(CASES)
    for c in CASES: assert (c['method'],c['path']) in catalogue
    return {'operation_count':len(operations),'schema_count':len(SCHEMAS),'resolved_local_references':len(refs),
            'verified_source_anchors':len(checked_evidence),'catalogue_route_consistency':'passed',
            'path_parameter_consistency':'passed','success_response_presence':'passed','empty_204_contracts':'passed',
            'security_declaration_presence':'passed','source_anchors':'passed',
            'planned_acceptance_case_count':len(CASES),'acceptance_case_route_consistency':'passed',
            'not_run':['Full OpenAPI specification validation','JSON Schema validation of examples','Application/database integration tests','Hosted schema or provider verification'],
            'scope':'Static draft structure and traceability only; authorization and business-rule behavior not tested.'}

if __name__=='__main__':
    checks=verify_structure()
    target=OUT/'openapi-reviewed-subset.json'
    target.write_text(json.dumps(spec,indent=2,ensure_ascii=False)+'\n')
    write_acceptance_cases()
    checks['artifact_sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
    (OUT/'contract-verification.json').write_text(json.dumps(checks,indent=2)+'\n')
    print(json.dumps(checks,indent=2))
