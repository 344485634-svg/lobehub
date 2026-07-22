'use client';

import { memo } from 'react';

import { ToolSettings } from '@/routes/(main)/settings/skill';

const Page = memo(() => <ToolSettings viewMode="skill" />);

Page.displayName = 'AdminSkillsPage';

export default Page;
