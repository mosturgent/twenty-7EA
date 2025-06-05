import { WORKFLOW_VISUALIZER_EDGE_DEFAULT_CONFIGURATION } from '@/workflow/workflow-diagram/constants/WorkflowVisualizerEdgeDefaultConfiguration';
import {
  WorkflowDiagram,
  WorkflowDiagramEdge,
  WorkflowDiagramNode,
} from '@/workflow/workflow-diagram/types/WorkflowDiagram';
import { v4 } from 'uuid';

export const addCreateStepNodes = ({ nodes, edges }: WorkflowDiagram) => {
  const nodesWithoutTargets = nodes.filter((node) =>
    edges.every((edge) => edge.source !== node.id),
  );

  const updatedNodes: Array<WorkflowDiagramNode> = nodes.slice();
  const updatedEdges: Array<WorkflowDiagramEdge> = edges.slice();

  for (const node of nodesWithoutTargets) {
    const newCreateStepNode: WorkflowDiagramNode = {
      // We only support a single branch for now, but include it in the id so
      // that it remains stable when multiple branches are introduced.
      // Using the parent node id ensures the identifier does not change across
      // renders, which allows the selection state of the node to persist.
      id: `branch-1__${node.id}__create-step`,
      type: 'create-step',
      data: {
        nodeType: 'create-step',
        parentNodeId: node.id,
      },
      position: { x: 0, y: 0 },
    };

    updatedNodes.push(newCreateStepNode);

    updatedEdges.push({
      ...WORKFLOW_VISUALIZER_EDGE_DEFAULT_CONFIGURATION,
      id: v4(),
      source: node.id,
      target: newCreateStepNode.id,
    });
  }

  return {
    nodes: updatedNodes,
    edges: updatedEdges,
  };
};
