import { createContext, useContext } from 'react';

import type { ResourceSchema } from './api';

export const SchemaContext = createContext<ResourceSchema[]>([]);

export function useSchema(): ResourceSchema[] {
  return useContext(SchemaContext);
}

export function useResource(plural: string | undefined): ResourceSchema | undefined {
  const schema = useSchema();
  return schema.find((r) => r.plural === plural);
}
