import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkflowStage = "profile" | "competitor-analysis" | "content-package" | "production" | "complete";
export type WorkflowDestination = "voice" | "repurposer" | "tubebot";

export interface WorkflowProfile {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
}

export interface WorkflowCompetitor {
  videoId: string;
  title: string;
  url: string;
  channelName?: string;
  thumbnail?: string;
}

export interface WorkflowContentPackage {
  rewriteId: string;
  title: string;
  fullScript: string;
  thumbnailPrompt?: string;
  seoTags: string[];
}

export interface CreatorWorkflowSession {
  id: string;
  stage: WorkflowStage;
  profile?: WorkflowProfile;
  competitor?: WorkflowCompetitor;
  niche?: string;
  contentPackage?: WorkflowContentPackage;
  handoff?: {
    destination: WorkflowDestination;
    status: "ready" | "opened" | "completed";
  };
  updatedAt: string;
}

interface WorkflowState {
  activeWorkflow: CreatorWorkflowSession | null;
  startProfile: (profile: WorkflowProfile, niche?: string) => void;
  selectCompetitor: (competitor: WorkflowCompetitor, niche?: string) => void;
  saveContentPackage: (contentPackage: WorkflowContentPackage) => void;
  startHandoff: (destination: WorkflowDestination) => void;
  completeHandoff: (destination: WorkflowDestination) => void;
  clearWorkflow: () => void;
}

const timestamp = () => new Date().toISOString();
const workflowId = () => `wf_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      activeWorkflow: null,
      startProfile: (profile, niche) => set({
        activeWorkflow: {
          id: workflowId(),
          stage: "profile",
          profile,
          ...(niche ? { niche } : {}),
          updatedAt: timestamp(),
        },
      }),
      selectCompetitor: (competitor, niche) => set((state) => {
        const current = state.activeWorkflow;
        return {
          activeWorkflow: {
            id: current?.id ?? workflowId(),
            stage: "competitor-analysis",
            profile: current?.profile,
            competitor,
            niche: niche ?? current?.niche,
            updatedAt: timestamp(),
          },
        };
      }),
      saveContentPackage: (contentPackage) => set((state) => {
        const current = state.activeWorkflow;
        return {
          activeWorkflow: {
            id: current?.id ?? workflowId(),
            stage: "content-package",
            profile: current?.profile,
            competitor: current?.competitor,
            niche: current?.niche,
            contentPackage,
            updatedAt: timestamp(),
          },
        };
      }),
      startHandoff: (destination) => set((state) => {
        const current = state.activeWorkflow;
        if (!current?.contentPackage) return state;
        return {
          activeWorkflow: {
            ...current,
            stage: "production",
            handoff: { destination, status: "opened" },
            updatedAt: timestamp(),
          },
        };
      }),
      completeHandoff: (destination) => set((state) => {
        const current = state.activeWorkflow;
        if (!current) return state;
        return {
          activeWorkflow: {
            ...current,
            stage: "complete",
            handoff: { destination, status: "completed" },
            updatedAt: timestamp(),
          },
        };
      }),
      clearWorkflow: () => set({ activeWorkflow: null }),
    }),
    {
      name: "tubeclick-creator-workflow-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
