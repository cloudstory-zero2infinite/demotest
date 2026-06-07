import React from 'react';
import { RiskRegistryView } from '../risk/RiskRegistryView';

interface RiskTabProps {
    isActive?: boolean;
}

export const RiskTab: React.FC<RiskTabProps> = ({ isActive = true }) => (
    <div className="py-3">
        <RiskRegistryView isActive={isActive} />
    </div>
);
