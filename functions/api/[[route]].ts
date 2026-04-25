import worker from '../../worker/src/index';

export const onRequest = async (context: any) => {
  return worker.fetch(context.request, context.env, context);
};
