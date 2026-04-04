import React from 'react';
import { OrgDiagramView } from './OrgDiagramView';

export const ViewOrganizationTab: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    return <OrgDiagramView isActive={isActive} />;
};
