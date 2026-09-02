import { createFileRoute } from '@tanstack/react-router'
import { Booking } from '../../pages/Booking'
export const Route = createFileRoute('/_customer/booking')({ component: Booking })
