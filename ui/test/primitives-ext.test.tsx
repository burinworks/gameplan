import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppActionsContext, useAppActions } from '../src/app/appActions';
import { fmtDayDate } from '../src/lib/format';
import { Chip, DateField, EmptyState, Field, Page, Select, Sheet, TokenField } from '../src/ui';

describe('Field', () => {
  it('shows the Add hint only while typing, click and Enter submit', async () => {
    const onEnter = vi.fn();
    function Host() {
      const [v, setV] = useState('');
      return <Field label="Capture" variant="quiet" icon="inbox" submitHint="Add" value={v} onChange={setV} onEnter={onEnter} />;
    }
    render(<Host />);
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull();
    const input = screen.getByRole('textbox', { name: 'Capture' });
    await userEvent.type(input, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(onEnter).toHaveBeenCalledTimes(1);
    await userEvent.type(input, '{Enter}');
    expect(onEnter).toHaveBeenCalledTimes(2);
  });
});

describe('Chip', () => {
  it('renders a status dot', () => {
    const { container } = render(<Chip tone="risk" dot>Conflict</Chip>);
    expect(container.querySelector('.gp-chip__dot')).toBeInTheDocument();
  });
});

describe('fmtDayDate', () => {
  it('adds the year only when it differs from today', () => {
    expect(fmtDayDate('2026-12-04', '2026-11-27')).toBe('Fri, Dec 4');
    expect(fmtDayDate('2027-01-15', '2026-11-27')).toBe('Fri, Jan 15, 2027');
  });
});

describe('DateField', () => {
  function Host({ min, weekStart }: { min?: string; weekStart?: 'mon' | 'sun' }) {
    const [v, setV] = useState('2026-12-04');
    return <DateField label="Due" value={v} onChange={setV} today="2026-11-27" min={min} weekStart={weekStart} />;
  }
  it('displays the day and steps with − and +', async () => {
    render(<Host />);
    expect(screen.getByRole('button', { name: 'Fri, Dec 4' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByRole('button', { name: 'Sat, Dec 5' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByRole('button', { name: 'Thu, Dec 3' })).toBeInTheDocument();
  });
  it('respects min', async () => {
    render(<Host min="2026-12-04" />);
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();
  });
  it('picks from the calendar, ordered by week start', async () => {
    render(<Host weekStart="sun" />);
    await userEvent.click(screen.getByRole('button', { name: 'Fri, Dec 4' }));
    const cal = screen.getByRole('dialog', { name: 'Due calendar' });
    const heads = within(cal).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads[0]).toBe('Su');
    expect(within(cal).getByText('December 2026')).toBeInTheDocument();
    await userEvent.click(within(cal).getByRole('button', { name: 'Tue, Dec 15' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tue, Dec 15' })).toBeInTheDocument();
  });
  it('navigates months and supports inline calendars', async () => {
    function Inline() {
      const [v, setV] = useState('2026-12-04');
      return <DateField label="Due" value={v} onChange={setV} today="2026-11-27" inlineCalendar />;
    }
    render(<Inline />);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('January 2027')).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('opens a menu and changes value', async () => {
    const onChange = vi.fn();
    render(<Select label="Status" value="a" onChange={onChange} options={[{ value: 'a', label: 'Planned', swatch: 'red' }, { value: 'b', label: 'Active', diamond: 'blue' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Status: Planned' }));
    expect(screen.getByRole('menuitemradio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Active' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('EmptyState', () => {
  it('renders title, hint and one CTA', async () => {
    const onClick = vi.fn();
    render(<EmptyState icon="plus" title="No projects yet" hint="Create one" action={{ label: 'New project', onClick }} overlay />);
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Page', () => {
  it('renders header and body', () => {
    render(<Page title="Inbox" count={3} actions={<button>Go</button>}>body</Page>);
    expect(screen.getByRole('heading', { level: 1, name: /Inbox/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inbox' })).toHaveTextContent('body');
  });
});

describe('Sheet', () => {
  it('× closes', async () => {
    const onClose = vi.fn();
    render(<Sheet title="T" onClose={onClose} footer={<button>OK</button>}>x</Sheet>);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TokenField', () => {
  it('Enter adds a token, Backspace on empty removes the last, × removes one', async () => {
    function Host() {
      const [t, setT] = useState<string[]>(['QA']);
      return <TokenField label="Areas" tokens={t} onChange={setT} />;
    }
    render(<Host />);
    const input = screen.getByRole('textbox', { name: 'Areas' });
    await userEvent.type(input, 'Backend{Enter}');
    expect(screen.getByRole('button', { name: 'Remove Backend' })).toBeInTheDocument();
    await userEvent.type(input, 'backend{Enter}');
    expect(screen.getAllByRole('button', { name: /Remove/ })).toHaveLength(2);
    await userEvent.type(input, '{Backspace}');
    expect(screen.queryByRole('button', { name: 'Remove Backend' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove QA' }));
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});

describe('useAppActions', () => {
  it('reads the provided actions', () => {
    const openNewProject = vi.fn();
    function C() {
      return <button onClick={useAppActions().openNewProject}>go</button>;
    }
    render(
      <AppActionsContext.Provider value={{ openNewProject, openSearch: () => {} }}>
        <C />
      </AppActionsContext.Provider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(openNewProject).toHaveBeenCalled();
  });
});
