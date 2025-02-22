import {expect, test} from '@playwright/test';
import {globalDataRequests, limitRequests, mockApi, responseFixtures} from '../../../utils/acceptance';

test.describe('User invitations', async () => {
    test('Supports inviting a user', async ({page}) => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);

        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            browseUsers: {method: 'GET', path: '/users/?limit=100&include=roles', response: responseFixtures.users},
            browseInvites: {method: 'GET', path: '/invites/', response: responseFixtures.invites},
            browseRoles: {method: 'GET', path: '/roles/?limit=all', response: responseFixtures.roles},
            browseAssignableRoles: {method: 'GET', path: '/roles/?limit=all&permissions=assign', response: responseFixtures.roles},
            addInvite: {method: 'POST', path: '/invites/', response: {
                invites: [
                    {
                        id: 'new-invite-id',
                        role_id: '645453f3d254799990dd0e18',
                        status: 'sent',
                        email: 'newuser@test.com',
                        expires: futureDate.getTime(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                ]
            }}
        }});

        await page.goto('/');

        const section = page.getByTestId('users');

        await section.getByRole('button', {name: 'Invite people'}).click();

        const modal = page.getByTestId('invite-user-modal');
        await modal.getByLabel('Email address').fill('newuser@test.com');
        await modal.locator('input[value=author]').check();
        await modal.getByRole('button', {name: 'Send invitation now'}).click();

        await expect(page.getByTestId('toast-success')).toHaveText(/Invitation successfully sent to newuser@test\.com/);

        await section.getByRole('tab', {name: 'Invited'}).click();

        const listItem = section.getByTestId('user-invite').last();

        await expect(listItem.getByText('newuser@test.com')).toBeVisible();
        await expect(listItem.getByText('Author')).toBeVisible();

        expect(lastApiRequests.addInvite?.body).toEqual({
            invites: [{
                email: 'newuser@test.com',
                expires: null,
                role_id: '645453f3d254799990dd0e18',
                status: null,
                token: null
            }]
        });
    });

    test('Supports resending invitations', async ({page}) => {
        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            browseUsers: {method: 'GET', path: '/users/?limit=100&include=roles', response: responseFixtures.users},
            browseInvites: {method: 'GET', path: '/invites/', response: responseFixtures.invites},
            deleteInvite: {method: 'DELETE', path: `/invites/${responseFixtures.invites.invites[0].id}/`, response: {}},
            addInvite: {method: 'POST', path: '/invites/', response: responseFixtures.invites}
        }});

        await page.goto('/');

        const section = page.getByTestId('users');
        await section.getByRole('tab', {name: 'Invited'}).click();

        const listItem = section.getByTestId('user-invite');
        await listItem.hover();

        await listItem.getByRole('button', {name: 'Resend'}).click();

        await expect(page.getByTestId('toast-success')).toHaveText(/Invitation resent! \(invitee@test\.com\)/);

        // Resending works by deleting and re-adding the invite

        expect(lastApiRequests.deleteInvite?.url).toMatch(new RegExp(`/invites/${responseFixtures.invites.invites[0].id}`));

        expect(lastApiRequests.addInvite?.body).toEqual({
            invites: [{
                email: 'invitee@test.com',
                expires: null,
                role_id: '645453f3d254799990dd0e18',
                status: null,
                token: null
            }]
        });
    });

    test('Supports revoking invitations', async ({page}) => {
        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            browseUsers: {method: 'GET', path: '/users/?limit=100&include=roles', response: responseFixtures.users},
            browseInvites: {method: 'GET', path: '/invites/', response: responseFixtures.invites},
            deleteInvite: {method: 'DELETE', path: `/invites/${responseFixtures.invites.invites[0].id}/`, response: {}}
        }});

        await page.goto('/');

        const section = page.getByTestId('users');
        await section.getByRole('tab', {name: 'Invited'}).click();

        const listItem = section.getByTestId('user-invite');
        await listItem.hover();

        await listItem.getByRole('button', {name: 'Revoke'}).click();

        await expect(page.getByTestId('toast-success')).toHaveText(/Invitation revoked \(invitee@test\.com\)/);

        expect(lastApiRequests.deleteInvite?.url).toMatch(new RegExp(`/invites/${responseFixtures.invites.invites[0].id}`));
    });

    test('Limits inviting too many staff users', async ({page}) => {
        await mockApi({page, requests: {
            ...globalDataRequests,
            ...limitRequests,
            browseAssignableRoles: {method: 'GET', path: '/roles/?limit=all&permissions=assign', response: responseFixtures.roles},
            browseConfig: {
                ...globalDataRequests.browseConfig,
                response: {
                    config: {
                        ...responseFixtures.config.config,
                        hostSettings: {
                            limits: {
                                staff: {
                                    max: 1,
                                    error: 'Your plan does not support more staff'
                                }
                            }
                        }
                    }
                }
            }
        }});

        await page.goto('/');

        const section = page.getByTestId('users');

        await section.getByRole('button', {name: 'Invite people'}).click();

        const modal = page.getByTestId('invite-user-modal');

        await modal.locator('input[value=author]').check();

        await expect(modal).toHaveText(/Your plan does not support more staff/);

        await modal.locator('input[value=contributor]').check();

        await expect(modal).not.toHaveText(/Your plan does not support more staff/);
    });
});
