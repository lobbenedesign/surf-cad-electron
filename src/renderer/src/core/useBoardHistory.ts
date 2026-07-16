// Whole-document snapshot history (not command-pattern): BoardState is always
// replaced wholesale by its producers, so a history entry is just a reference —
// no diffing/patches needed. Drag-driven edits (bezier point dragging, slider-style
// number inputs) fire many updates per gesture; beginEdit()/endEdit() bracket a
// gesture so all its updates collapse into a single undo step instead of one per
// pixel of mouse movement.
import { useCallback, useMemo, useReducer } from 'react'
import type { BoardState } from './types'

const MAX_HISTORY = 200

interface HistoryState {
  present: BoardState
  past: BoardState[]
  future: BoardState[]
  editing: boolean
}

type Action =
  | { type: 'commit'; updater: (b: BoardState) => BoardState }
  | { type: 'beginEdit' }
  | { type: 'endEdit' }
  | { type: 'undo' }
  | { type: 'redo' }

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'beginEdit':
      if (state.editing) return state
      return { ...state, past: [...state.past, state.present].slice(-MAX_HISTORY), future: [], editing: true }
    case 'commit': {
      const next = action.updater(state.present)
      if (state.editing) return { ...state, present: next }
      return { ...state, past: [...state.past, state.present].slice(-MAX_HISTORY), future: [], present: next }
    }
    case 'endEdit':
      return { ...state, editing: false }
    case 'undo': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return { present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future], editing: false }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return { present: next, past: [...state.past, state.present], future: state.future.slice(1), editing: false }
    }
    default:
      return state
  }
}

export interface BoardHistory {
  board: BoardState
  setBoard: (updater: (b: BoardState) => BoardState) => void
  beginEdit: () => void
  endEdit: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useBoardHistory(initial: BoardState): BoardHistory {
  const [state, dispatch] = useReducer(reducer, { present: initial, past: [], future: [], editing: false })

  const setBoard = useCallback((updater: (b: BoardState) => BoardState) => {
    dispatch({ type: 'commit', updater })
  }, [])

  const beginEdit = useCallback(() => dispatch({ type: 'beginEdit' }), [])
  const endEdit = useCallback(() => dispatch({ type: 'endEdit' }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  return useMemo(
    () => ({
      board: state.present,
      setBoard,
      beginEdit,
      endEdit,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0
    }),
    [state, setBoard, beginEdit, endEdit, undo, redo]
  )
}
