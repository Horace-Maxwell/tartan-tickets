# Tartan Tickets: Test Spec

## Headline tests (the four for the one-page spec)
1. `test_organizer_of_one_club_cannot_see_another_clubs_attendee_list` (S1, R3.3)
2. `test_order_is_not_marked_paid_when_webhook_signature_is_invalid` (S2, R1.2, R1.4)
3. `test_same_ticket_scanned_twice_is_rejected_the_second_time` (S3, R3.2)
4. `test_buyer_cannot_cancel_ticket_within_24_hours_of_event` (R2.3)

## Full requirement-to-test map
| Req | Test name |
|---|---|
| R1.1 | `test_checkout_session_uses_the_clubs_connected_account_and_listed_price` |
| R1.2 | `test_verified_webhook_marks_order_paid_and_issues_one_ticket` |
| R1.3 | `test_checkout_is_refused_when_event_is_sold_out` |
| R1.3 | `test_two_buyers_racing_for_the_last_seat_only_one_succeeds` |
| R1.4 | `test_unpaid_order_has_no_ticket` |
| R2.1 | `test_buyer_can_cancel_ticket_more_than_24_hours_before_event` |
| R2.2 | `test_cancelled_ticket_qr_is_voided_before_refund_is_issued` |
| R2.3 | `test_buyer_cannot_cancel_ticket_within_24_hours_of_event` |
| R2.4 | `test_cancelling_an_event_refunds_every_paid_order` |
| R3.1 | `test_valid_unused_ticket_scans_as_admit` |
| R3.2 | `test_ticket_for_a_different_event_scans_as_reject` |
| R3.2 | `test_voided_ticket_scans_as_reject` |
| R3.3 | `test_organizer_of_one_club_cannot_see_another_clubs_attendee_list` |
| S1 | `test_buyer_cannot_view_someone_elses_order_by_changing_the_id` |
| S1 | `test_cross_club_access_returns_404_and_is_logged` |
| S2 | `test_order_is_not_marked_paid_when_webhook_signature_is_invalid` |
| S2 | `test_webhook_with_wrong_amount_does_not_mark_order_paid` |
| S2 | `test_replayed_webhook_does_not_issue_a_second_ticket` |
| S3 | `test_same_ticket_scanned_twice_is_rejected_the_second_time` |
| S3 | `test_guessed_or_altered_qr_token_scans_as_reject` |
| S4 | `test_organizer_cannot_change_payout_account_without_admin_approval` |
| S4 | `test_mass_refund_writes_an_audit_log_entry` |
