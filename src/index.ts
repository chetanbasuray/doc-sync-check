#!/usr/bin/env node
import { program } from 'commander';

program
  .version('1.0.0')
  .description('CLI for detecting documentation drift via AST parsing');

program.parse(process.argv);