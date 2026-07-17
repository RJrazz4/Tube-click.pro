/**
 * @deprecated — Use @/api/client/secureClient instead.
 * This file is kept for backward compatibility during Phase A1 migration.
 * It now re-exports the secure client which NO LONGER accepts customApiKey.
 */
export { EdgeFunctionError, fetchEdgeFunctionJson, fetchEdgeFunctionBlob } from "@/api/client/secureClient";
