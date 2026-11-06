// Reports only whether Broker play is configured: enabled, a key and a valid model (admin setting or env).
import {brokerKey,activeModel} from '../../lib/broker.mjs';
import {validModelId} from '../../settings.js';
export default {async fetch(){const {model}=await activeModel();return new Response(JSON.stringify({mode:'broker',configured:process.env.BROKER_GAME_ENABLED==='true'&&Boolean(brokerKey())&&model!==''&&validModelId(model)}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}};
