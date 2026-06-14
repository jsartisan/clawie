import { Button, Header } from 'react-aria-components';
import { useNavigate } from '@tanstack/react-router';
import {
  IconDeviceDesktop,
  IconMoon,
  IconSun,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

import { Icon } from 'ui/components/Icon';
import { Avatar } from 'ui/components/Avatar';
import {
  Menu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
} from 'ui/components/Menu';
import {
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from 'ui/components/ToggleButtonGroup';

import { useSchema } from '../lib/schema';
import { titleCase } from '../lib/format';
import { useTheme, type ThemeId } from '../lib/theme';

const THEME_OPTIONS: { id: ThemeId; icon: TablerIcon; label: string }[] = [
  { id: 'light', icon: IconSun, label: 'Light theme' },
  { id: 'dark', icon: IconMoon, label: 'Dark theme' },
  { id: 'system', icon: IconDeviceDesktop, label: 'System theme' },
];

export function UserMenu() {
  const { setTheme, theme } = useTheme();
  const schema = useSchema();
  const navigate = useNavigate();

  return (
    <MenuTrigger>
      <Button
        aria-label="Menu"
        className="hover:bg-accent pressed:bg-accent flex cursor-default items-center rounded-full p-0.5 transition-colors outline-none"
      >
        <Avatar name="NanoClaw" size="sm" className="size-7" />
      </Button>
      <Menu className="w-60" placement="bottom end">
        <Header className="px-2 py-1.5">
          <ToggleButtonGroup
            size="sm"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={new Set([theme])}
            onSelectionChange={(keys) => {
              const [next] = keys;
              if (typeof next === 'string') setTheme(next as ThemeId);
            }}
            className="bg-muted rounded-md p-0.5"
          >
            {THEME_OPTIONS.map((option) => (
              <ToggleButtonGroupItem
                key={option.id}
                id={option.id}
                aria-label={option.label}
                className="flex-1"
              >
                <Icon icon={option.icon} size="sm" />
              </ToggleButtonGroupItem>
            ))}
          </ToggleButtonGroup>
        </Header>

        {schema.length > 0 && (
          <>
            <MenuSeparator />
            <MenuSection title="Advanced">
              {schema.map((r) => (
                <MenuItem
                  key={r.plural}
                  id={`r-${r.plural}`}
                  onAction={() => navigate({ to: '/r/$plural', params: { plural: r.plural } })}
                >
                  {titleCase(r.plural)}
                </MenuItem>
              ))}
            </MenuSection>
          </>
        )}
      </Menu>
    </MenuTrigger>
  );
}
