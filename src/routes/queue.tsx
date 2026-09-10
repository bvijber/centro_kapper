import { createFileRoute } from '@tanstack/react-router'
import { Queue } from '../pages/Queue'

export const Route = createFileRoute('/queue')({ component: Queue })
