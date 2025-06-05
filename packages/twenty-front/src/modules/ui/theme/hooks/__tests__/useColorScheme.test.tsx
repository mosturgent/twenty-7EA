import { act, renderHook } from '@testing-library/react';
import { RecoilRoot } from 'recoil';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useColorScheme } from '@/ui/theme/hooks/useColorScheme';
import { WorkspaceMember } from '@/workspace-member/types/WorkspaceMember';

const updateOneRecordMock = jest.fn();

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({
    updateOneRecord: updateOneRecordMock,
  }),
}));

const workspaceMember: Omit<
  WorkspaceMember,
  'createdAt' | 'updatedAt' | 'userId' | 'userEmail'
> = {
  __typename: 'WorkspaceMember',
  id: 'id',
  name: {
    firstName: 'firstName',
    lastName: 'lastName',
  },
  locale: 'en',
  colorScheme: 'System',
};

describe('useColorScheme', () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot
      initializeState={({ set }) => {
        set(currentWorkspaceMemberState, workspaceMember);
      }}
    >
      {children}
    </RecoilRoot>
  );

  it('should update color scheme', async () => {
    const { result } = renderHook(() => useColorScheme(), {
      wrapper: Wrapper,
    });

    expect(result.current.colorScheme).toBe('System');

    await act(async () => {
      await result.current.setColorScheme('Dark');
    });

    expect(result.current.colorScheme).toEqual('Dark');
  });
});
